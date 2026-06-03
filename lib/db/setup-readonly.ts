/**
 * 一次性建好 query_sql 的「只读角色」——纵深防御的连接层（根本保证，DB 层物理拒写 + 物理脱敏）。
 *
 *   pnpm tsx --env-file=.env.local --env-file=.env lib/db/setup-readonly.ts
 *
 * 建**两个**只读角色（都 default_transaction_read_only + statement_timeout，绝不授予任何写）：
 *   1. jxc_readonly      —— 采购/老板用：SELECT 业务表（不含 app_user 口令表）。
 *   2. jxc_readonly_wh   —— 仓管用：只能读 stock_ledger / move_draft，以及一个**去掉 cost_price 的 sku 视图**
 *                          （search_path 把 sku 指向该视图）。成本价/采购单/盘点在 DB 层就读不到——
 *                          连 to_jsonb(sku)、sku::text 这类整行序列化也带不出成本价（视图里根本没有这列）。
 *
 * 幂等：可重复执行。脱敏靠 DB 角色与视图，而非应用层删字段，符合「权限在数据层生效」。
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

const FULL = "jxc_readonly";
const WH = "jxc_readonly_wh";
const MASK_SCHEMA = "jxc_mask";

// 采购/老板可读的业务表（不含 app_user）；仓管另走视图，下面单列。
const FULL_TABLES = ["sku", "stock_ledger", "move_draft", "purchase_order", "po_line", "stocktake", "stocktake_count"];
// 仓管可直读的明细表（sku 走视图，不在此列）。
const WH_TABLES = ["stock_ledger", "move_draft"];

async function ensureRole(sql: NeonQueryFunction<false, false>, role: string, password: string) {
  await sql(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
      CREATE ROLE ${role} LOGIN PASSWORD '${password}';
    ELSE
      ALTER ROLE ${role} LOGIN PASSWORD '${password}';
    END IF;
  END $$;`);
  await sql(`ALTER ROLE ${role} SET default_transaction_read_only = on`);
  await sql(`ALTER ROLE ${role} SET statement_timeout = '5000ms'`);
}

function urlFor(owner: string, role: string, password: string) {
  const u = new URL(owner);
  u.username = role;
  u.password = password;
  return u.toString();
}

async function main() {
  const owner = process.env.DATABASE_URL;
  if (!owner) throw new Error("DATABASE_URL 未设置（需要 owner 连接来建角色）");
  const sql = neon(owner);

  const pwFull = process.env.READONLY_PW_FULL ?? randomBytes(18).toString("base64url");
  const pwWh = process.env.READONLY_PW_WH ?? randomBytes(18).toString("base64url");
  for (const p of [pwFull, pwWh]) {
    if (!/^[A-Za-z0-9_-]+$/.test(p)) throw new Error("口令含非法字符，请用 base64url 口令");
  }
  const dbName = new URL(owner).pathname.replace(/^\//, "") || "neondb";

  // ---- 角色 ----
  await ensureRole(sql, FULL, pwFull);
  await ensureRole(sql, WH, pwWh);
  for (const r of [FULL, WH]) {
    await sql(`GRANT CONNECT ON DATABASE ${dbName} TO ${r}`);
    await sql(`GRANT USAGE ON SCHEMA public TO ${r}`);
  }

  // ---- 采购/老板：full 角色，逐表授予（显式排除 app_user 口令表）----
  for (const t of FULL_TABLES) await sql(`GRANT SELECT ON public.${t} TO ${FULL}`);
  await sql(`REVOKE ALL ON public.app_user FROM ${FULL}`); // 即便误授也收回——口令表 DB 层不可读

  // ---- 仓管：脱敏视图（去掉 cost_price）+ search_path 把 sku 指向它 ----
  await sql(`CREATE SCHEMA IF NOT EXISTS ${MASK_SCHEMA}`);
  await sql(`CREATE OR REPLACE VIEW ${MASK_SCHEMA}.sku AS
    SELECT sku_code, style_no, style_name, category, color, size, tag_price, safety_stock, barcode
    FROM public.sku`);
  await sql(`GRANT USAGE ON SCHEMA ${MASK_SCHEMA} TO ${WH}`);
  await sql(`GRANT SELECT ON ${MASK_SCHEMA}.sku TO ${WH}`);
  for (const t of WH_TABLES) await sql(`GRANT SELECT ON public.${t} TO ${WH}`);
  // 仓管直读 public.sku（含 cost_price）与采购/盘点表：一律不授予，DB 层拒。
  await sql(`REVOKE ALL ON public.sku FROM ${WH}`);
  await sql(`REVOKE ALL ON public.app_user FROM ${WH}`);
  for (const t of ["purchase_order", "po_line", "stocktake", "stocktake_count"]) {
    await sql(`REVOKE ALL ON public.${t} FROM ${WH}`);
  }
  // 关键：未限定的 sku 解析到脱敏视图（jxc_mask 在 public 之前）。
  await sql(`ALTER ROLE ${WH} SET search_path = ${MASK_SCHEMA}, public`);

  console.log("\n✓ 两个只读角色已就绪：");
  console.log(`  · ${FULL}    采购/老板（业务表，无 app_user）`);
  console.log(`  · ${WH}  仓管（脱敏视图 sku 无 cost_price + stock_ledger/move_draft）`);
  console.log("\n写进 .env.local，并在 Vercel 配同名环境变量：\n");
  console.log(`DATABASE_URL_READONLY="${urlFor(owner, FULL, pwFull)}"`);
  console.log(`DATABASE_URL_READONLY_WH="${urlFor(owner, WH, pwWh)}"\n`);
}

main().catch((e) => {
  console.error("setup-readonly 失败：", e);
  process.exit(1);
});
