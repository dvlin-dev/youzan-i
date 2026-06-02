"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "./db/client";
import { sku, poLine, purchaseOrder, stocktake, stocktakeCount } from "./db/schema";
import { insertRows, setDocPosted, deletePendingDoc } from "./db/ledger";
import { stockMap, pendingDocs, getPo, ledgerOf } from "./db/queries";
import { requireUser } from "./session";
import { signIn, signOut } from "./auth";
import { can, DEMO_USERS, type Role } from "./constants";
import { loadStocktakeView } from "./stocktake/engine";
import { bizTypeOf } from "./stocktake/attribution";
import { seed } from "./db/seed";

type Result = { ok: boolean; msg: string; docNo?: string };

function ymd(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function docNo(type: string) {
  return `${type}-${ymd()}-${String(Date.now()).slice(-4)}`;
}
function revalidateAll() {
  for (const p of ["/dashboard", "/stock", "/move", "/purchase", "/stocktake"]) revalidatePath(p);
}

const MoveInput = z.object({
  type: z.enum(["IN", "OUT"]),
  entries: z.array(z.object({ skuCode: z.string(), qty: z.number().int().positive() })).min(1),
});
export type MoveInput = z.infer<typeof MoveInput>;

/** 出入库：生成待复核流水（不直接入账）。出库不为负（守恒）。 */
export async function submitMove(raw: MoveInput): Promise<Result> {
  const u = await requireUser();
  if (!can.move(u.role)) return { ok: false, msg: "无权录入出入库（数据层拦截）" };
  const input = MoveInput.parse(raw);
  if (input.type === "OUT") {
    const sm = await stockMap();
    const bad = input.entries.find((e) => e.qty > (sm[e.skuCode] ?? 0));
    if (bad)
      return {
        ok: false,
        msg: `${bad.skuCode} 当前仅 ${sm[bad.skuCode] ?? 0} 件，出库 ${bad.qty} 件会导致负库存（已拦截）`,
      };
  }
  const doc = docNo(input.type);
  await insertRows(
    input.entries.map((e) => ({
      skuCode: e.skuCode,
      delta: input.type === "IN" ? e.qty : -e.qty,
      bizType: input.type === "IN" ? "采购到货" : "销售出库",
      docNo: doc,
      operatorId: u.name,
      status: "pending" as const,
      scanned: true,
    })),
  );
  revalidateAll();
  const sum = input.entries.reduce((a, e) => a + e.qty, 0);
  return { ok: true, msg: `已提交 ${doc} · ${sum} 件（待复核）`, docNo: doc };
}

/** 双人复核通过：reviewer ≠ creator 强校验。 */
export async function reviewDoc(doc: string): Promise<Result> {
  const u = await requireUser();
  if (!can.move(u.role)) return { ok: false, msg: "无权复核" };
  const pend = await pendingDocs();
  const rows = pend[doc];
  if (!rows?.length) return { ok: false, msg: "单据不存在或已处理" };
  if (rows[0].operatorId === u.name)
    return { ok: false, msg: "需由他人复核（录入人 ≠ 复核人）——请切换到另一账号复核" };
  await setDocPosted(doc, u.name);
  revalidateAll();
  return { ok: true, msg: `${doc} 已复核入账` };
}

export async function rejectDoc(doc: string): Promise<Result> {
  const u = await requireUser();
  if (!can.move(u.role)) return { ok: false, msg: "无权操作" };
  await deletePendingDoc(doc);
  revalidateAll();
  return { ok: true, msg: `${doc} 已驳回` };
}

/** 采购到货：生成入库（待复核）+ 回写 received + 推进状态机。 */
export async function receivePO(poNo: string): Promise<Result> {
  const u = await requireUser();
  if (!can.po(u.role)) return { ok: false, msg: "无权操作采购单" };
  const po = await getPo(poNo);
  if (!po) return { ok: false, msg: "采购单不存在" };
  if (!["已下单", "部分到货"].includes(po.status)) return { ok: false, msg: "当前状态不可收货" };
  const doc = docNo("IN");
  const rows = po.lines
    .filter((l) => l.ordered - l.received > 0)
    .map((l) => ({
      skuCode: l.skuCode,
      delta: l.ordered - l.received,
      bizType: "采购到货",
      docNo: doc,
      operatorId: u.name,
      poRef: poNo,
      qc: true,
      status: "pending" as const,
      scanned: true,
    }));
  if (!rows.length) return { ok: false, msg: "没有待收货明细" };
  await insertRows(rows);
  for (const l of po.lines) {
    if (l.ordered - l.received > 0)
      await db.update(poLine).set({ received: l.ordered }).where(eq(poLine.id, l.id));
  }
  await db.update(purchaseOrder).set({ status: "已入库" }).where(eq(purchaseOrder.poNo, poNo));
  revalidateAll();
  return { ok: true, msg: `${poNo} 登记到货，生成 ${doc}（待复核）`, docNo: doc };
}

/** 盘点过账：按归因追加盘盈/盘亏流水（串色成对），库存派生归零。仅老板。 */
async function postRows(skuCodes: string[], reviewer: string, pdNo: string, counter: string) {
  const view = await loadStocktakeView();
  if (!view) return 0;
  const byKey = new Map(view.rows.map((r) => [r.skuCode, r]));
  const toPost = new Set<string>();
  for (const k of skuCodes) {
    const r = byKey.get(k);
    if (!r || r.resolved) continue;
    toPost.add(k);
    if (r.attr.bucket === "swap" && r.attr.pair) toPost.add(r.attr.pair);
  }
  let n = 0;
  for (const k of toPost) {
    const r = byKey.get(k);
    if (!r || r.resolved) continue;
    await insertRows([
      {
        skuCode: k,
        delta: r.diff,
        bizType: bizTypeOf(r.attr.bucket),
        docNo: pdNo,
        operatorId: counter,
        reviewerId: reviewer,
        status: "posted",
        pdAdjust: true,
        scanned: true,
      },
    ]);
    await db
      .update(stocktakeCount)
      .set({ resolved: true })
      .where(and(eq(stocktakeCount.pdNo, pdNo), eq(stocktakeCount.skuCode, k)));
    n++;
  }
  return n;
}

export async function adoptStocktakeRow(skuCode: string): Promise<Result> {
  const u = await requireUser();
  if (!can.postStocktake(u.role)) return { ok: false, msg: "仅老板可过账" };
  const view = await loadStocktakeView();
  if (!view) return { ok: false, msg: "无盘点单" };
  const n = await postRows([skuCode], u.name, view.stocktake.pdNo, view.stocktake.counter);
  const left = await loadStocktakeView();
  if (left && left.rows.every((r) => r.resolved))
    await db.update(stocktake).set({ status: "已过账" }).where(eq(stocktake.pdNo, left.stocktake.pdNo));
  revalidateAll();
  return { ok: n > 0, msg: n > 0 ? `已采纳建议，生成 ${n} 笔调整流水（已复核）` : "无可处理项" };
}

export async function postAllStocktake(): Promise<Result> {
  const u = await requireUser();
  if (!can.postStocktake(u.role)) return { ok: false, msg: "仅老板可过账" };
  const view = await loadStocktakeView();
  if (!view) return { ok: false, msg: "无盘点单" };
  const keys = view.rows.filter((r) => !r.resolved).map((r) => r.skuCode);
  const n = await postRows(keys, u.name, view.stocktake.pdNo, view.stocktake.counter);
  await db.update(stocktake).set({ status: "已过账" }).where(eq(stocktake.pdNo, view.stocktake.pdNo));
  revalidateAll();
  return { ok: true, msg: `盘点过账完成：${n} 个 SKU 已生成差异调整流水（双人复核）` };
}

/** 重置演示数据（老板）。 */
export async function resetDemo(): Promise<Result> {
  const u = await requireUser();
  if (u.role !== "admin") return { ok: false, msg: "仅老板可重置" };
  await seed();
  revalidateAll();
  return { ok: true, msg: "已重置演示数据（重灌 9 埋雷盘点 + 库存）" };
}

function isRedirect(e: unknown) {
  return typeof (e as { digest?: string })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

/** 真实登录（登录页预填账号密码，点击即登）。 */
export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (isRedirect(e)) throw e;
    return "邮箱或密码不正确";
  }
  return null;
}

/** 一键切换演示角色（以对应账号真实登录）。 */
export async function switchRole(role: Role): Promise<void> {
  const u = DEMO_USERS.find((x) => x.role === role);
  if (!u) return;
  // redirect:false → 仅设置会话 cookie 并返回；由客户端 router.refresh() 刷新（命令式调用下 redirect 不生效）。
  await signIn("credentials", { email: u.email, password: u.password, redirect: false });
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
}

/** 抽屉用：取某 SKU 的元信息 + 完整流水链。 */
export async function fetchLedger(skuCode: string) {
  await requireUser();
  const [s] = await db.select().from(sku).where(eq(sku.skuCode, skuCode));
  const rows = await ledgerOf(skuCode);
  return { sku: s ?? null, rows };
}
