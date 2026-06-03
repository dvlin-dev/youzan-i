import { describe, it, expect, beforeAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import { runReadonlyQuery, readonlyEnabled } from "../lib/db/readonly";

/**
 * query_sql 连接层集成回归（gated）。**只读不写**——写尝试都被 DB 拒，不改任何数据，
 * 故对线上同一个 Neon 库也安全。需要两条只读连接才跑：
 *   pnpm test:integration
 * 普通 `pnpm test` 下（无 env）整组自动跳过。
 */
const RUN = !!process.env.DATABASE_URL_READONLY && !!process.env.DATABASE_URL_READONLY_WH;

describe.skipIf(!RUN)("query_sql 连接层集成（只读，gated）", () => {
  // Neon serverless 计算可能挂起，首个查询会冷启动（偶发 fetch failed）。预热 + 退避重试，避免假阴性。
  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      try {
        await runReadonlyQuery("select 1 as ok", "admin");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }, 20000);

  it("readonlyEnabled 对采购/老板与仓管都为真", () => {
    expect(readonlyEnabled("admin")).toBe(true);
    expect(readonlyEnabled("warehouse")).toBe(true);
  });

  it("正常 SELECT（JOIN + 聚合）返回行", async () => {
    const { rows } = await runReadonlyQuery(
      "select s.color, sum(l.delta)::int q from stock_ledger l join sku s on s.sku_code = l.sku_code where l.status = 'posted' group by s.color",
      "admin",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("color");
  });

  it("连接层物理拒写：只读角色对 UPDATE/INSERT/DELETE/CREATE 全部报错（无写副作用）", async () => {
    const ro = neon(process.env.DATABASE_URL_READONLY!);
    for (const w of [
      "update sku set safety_stock = safety_stock + 0",
      "insert into stock_ledger (sku_code, delta, biz_type, doc_no, operator_id) values ('x',1,'t','t','t')",
      "delete from move_draft where false",
      "create table _jxc_should_not_exist_ (i int)",
    ]) {
      await expect(ro(w), w).rejects.toThrow(/read-only|permission denied/i);
    }
  });

  it("仓管脱敏焊在 DB 层：整行序列化也带不出 cost_price", async () => {
    for (const sql of [
      "select to_jsonb(sku) j from sku limit 1",
      "select row_to_json(s) j from sku s limit 1",
      "select * from sku limit 1",
      "select sku::text t from sku limit 1",
    ]) {
      const { rows } = await runReadonlyQuery(sql, "warehouse");
      expect(JSON.stringify(rows), sql).not.toMatch(/cost_price/);
    }
  });

  it("采购/老板能读 cost_price（与仓管区分）", async () => {
    const { rows } = await runReadonlyQuery("select sku_code, cost_price from sku limit 1", "admin");
    expect(rows[0]).toHaveProperty("cost_price");
  });

  it("仓管的只读角色对采购单/盘点表无权（DB 层兜底，不靠 guard）", async () => {
    const wh = neon(process.env.DATABASE_URL_READONLY_WH!);
    await expect(wh("select 1 from purchase_order limit 1")).rejects.toThrow(/permission denied|does not exist/i);
    await expect(wh("select 1 from stocktake_count limit 1")).rejects.toThrow(/permission denied|does not exist/i);
  });

  it("RC-08 全表守恒（只读）：没有任何 SKU 的 posted 库存为负", async () => {
    const { rows } = await runReadonlyQuery(
      "select count(*)::int n from (select sku_code from stock_ledger where status='posted' group by sku_code having sum(delta) < 0) t",
      "admin",
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("自动 LIMIT：超过上限的查询被截断并标记 truncated", async () => {
    const { rows, truncated } = await runReadonlyQuery("select generate_series(1, 5000) as n", "admin");
    expect(rows.length).toBeLessThanOrEqual(200);
    expect(truncated).toBe(true);
  });
});
