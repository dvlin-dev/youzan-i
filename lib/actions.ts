"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "./db/client";
import { sku, poLine, purchaseOrder, stocktake, stocktakeCount, type Sku } from "./db/schema";
import { insertRows } from "./db/ledger";
import { insertDraft, getDraft, deleteDraft, getDraftsByPo, postDraftAtomic } from "./db/draft";
import { stockMap, getPo, ledgerOf, receivedByPo } from "./db/queries";
import { requireUser } from "./session";
import { signIn, signOut } from "./auth";
import { can, DEMO_USERS, type Role } from "./constants";
import { loadStocktakeView } from "./stocktake/engine";
import { bizTypeOf } from "./stocktake/attribution";
import { explainAttribution } from "./ai/explain";
import { aiEnabled } from "./ai/client";
import { seed } from "./db/seed";

type Result = { ok: boolean; msg: string; docNo?: string };

function ymd(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function docNo(type: string) {
  // 末尾加随机串：AI 一轮内可能并发多次 record_move，避免同毫秒生成相同单号被并成一张单。
  return `${type}-${ymd()}-${String(Date.now()).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
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
  await insertDraft(
    input.entries.map((e) => ({
      skuCode: e.skuCode,
      delta: input.type === "IN" ? e.qty : -e.qty,
      bizType: input.type === "IN" ? "采购到货" : "销售出库",
      docNo: doc,
      operatorId: u.name,
      scanned: true,
    })),
  );
  revalidateAll();
  const sum = input.entries.reduce((a, e) => a + e.qty, 0);
  return { ok: true, msg: `已提交 ${doc} · ${sum} 件（待复核）`, docNo: doc };
}

/**
 * 审批入账：单人审批即可（任意有出入库权限者，审批人可与录入人相同）+ 守恒护栏。
 * 通过 postDraftAtomic 在单条原子语句里「校验落账后库存不为负 + 追加 posted 流水」，
 * 杜绝两张待复核出库单各自初检通过、审批后双双打穿库存。
 */
export async function reviewDoc(doc: string): Promise<Result> {
  const u = await requireUser();
  if (!can.move(u.role)) return { ok: false, msg: "无权审批" };
  const rows = await getDraft(doc);
  if (!rows.length) return { ok: false, msg: "单据不存在或已处理" };

  const posted = await postDraftAtomic(doc, u.name);
  if (!posted.length) {
    // 被守恒拦截：定位首个会打穿库存的 SKU，给出可读提示
    const sm = await stockMap();
    const need = new Map<string, number>();
    for (const r of rows) need.set(r.skuCode, (need.get(r.skuCode) ?? 0) + r.delta);
    let msg = "复核未通过：库存守恒校验失败（请先驳回或调整）";
    for (const [code, dlt] of need) {
      if ((sm[code] ?? 0) + dlt < 0) {
        msg = `${code} 当前 ${sm[code] ?? 0} 件，复核入账会导致负库存（守恒拦截）`;
        break;
      }
    }
    return { ok: false, msg };
  }
  await deleteDraft(doc);

  // 采购到货复核通过 → 推进采购单状态机（到货量由 posted 流水派生，单一真相）
  const poRef = rows.find((r) => r.poRef)?.poRef;
  if (poRef) await syncPoState(poRef);

  revalidateAll();
  return { ok: true, msg: `${doc} 已复核入账` };
}

export async function rejectDoc(doc: string): Promise<Result> {
  const u = await requireUser();
  if (!can.move(u.role)) return { ok: false, msg: "无权操作" };
  const rows = await getDraft(doc);
  if (!rows.length) return { ok: false, msg: "单据不存在或已处理" };
  await deleteDraft(doc);
  revalidateAll();
  return { ok: true, msg: `${doc} 已驳回（草稿删除，从未影响库存）` };
}

/** 采购单状态机：到货量由 posted 流水派生回写，并据此推进状态（草稿/已下单 → 部分到货 → 已入库）。 */
async function syncPoState(poNo: string) {
  const po = await getPo(poNo);
  if (!po) return;
  const recv = await receivedByPo(poNo);
  let allDone = true;
  let any = false;
  for (const l of po.lines) {
    const capped = Math.min(Math.max(0, recv[l.skuCode] ?? 0), l.ordered);
    await db.update(poLine).set({ received: capped }).where(eq(poLine.id, l.id));
    if (capped < l.ordered) allDone = false;
    if (capped > 0) any = true;
  }
  const status = allDone ? "已入库" : any ? "部分到货" : po.status;
  await db.update(purchaseOrder).set({ status }).where(eq(purchaseOrder.poNo, poNo));
}

/**
 * 采购到货：仅生成入库草稿（待复核），**不**预先回写到货进度 / 推进状态。
 * 到货只有在复核入账后才作数——这样被驳回的到货不会留下「已入库却没货」的错账。
 */
export async function receivePO(poNo: string): Promise<Result> {
  const u = await requireUser();
  if (!can.po(u.role)) return { ok: false, msg: "无权操作采购单" };
  const po = await getPo(poNo);
  if (!po) return { ok: false, msg: "采购单不存在" };
  if (!["已下单", "部分到货"].includes(po.status)) return { ok: false, msg: "当前状态不可收货" };
  if ((await getDraftsByPo(poNo)).length)
    return { ok: false, msg: "该采购单已有待复核的到货单，请先复核或驳回" };
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
      scanned: true,
    }));
  if (!rows.length) return { ok: false, msg: "没有待收货明细" };
  await insertDraft(rows);
  revalidateAll();
  return { ok: true, msg: `${poNo} 登记到货，生成 ${doc}（待复核，复核入账后才更新到货进度）`, docNo: doc };
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
  return { ok: true, msg: `盘点过账完成：${n} 个 SKU 已生成差异调整流水（老板审批）` };
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

/** 字段级脱敏在数据层生效：成本价对仓管根本不出现在响应体里（不是前端藏字段）。 */
function maskCost(s: Sku): Omit<Sku, "costPrice"> {
  const copy: Record<string, unknown> = { ...s };
  delete copy.costPrice;
  return copy as Omit<Sku, "costPrice">;
}

/** 抽屉用：取某 SKU 的元信息 + 完整流水链（成本价按角色脱敏）。 */
export async function fetchLedger(skuCode: string) {
  const u = await requireUser();
  const [s] = await db.select().from(sku).where(eq(sku.skuCode, skuCode));
  const safeSku = s ? (can.cost(u.role) ? s : maskCost(s)) : null;
  const rows = await ledgerOf(skuCode);
  return { sku: safeSku, rows };
}

/**
 * 第 2 层 AI 归因：把第 1 层确定性检测器的命中假设 + 证据交给 LLM 排序解释（HITL、按需触发）。
 * 第 1 层仍是权威（分桶 / 金额 / 真损失不依赖 LLM）；无 key / 出错时优雅降级到检测器结论。
 */
export async function explainDiff(
  skuCode: string,
): Promise<{ ok: boolean; text: string; degraded?: boolean }> {
  const u = await requireUser();
  if (!can.recon(u.role)) return { ok: false, text: "无权查看对账归因" };
  const view = await loadStocktakeView();
  const row = view?.rows.find((r) => r.skuCode === skuCode);
  if (!row) return { ok: false, text: "未找到该差异行" };
  if (!aiEnabled())
    return {
      ok: true,
      degraded: true,
      text:
        row.attr.reason +
        "\n\n（未配置 OPENAI_API_KEY，以上为第 1 层确定性检测器结论；配置后可启用 LLM 二层排序解释。）",
    };
  const ledger = await ledgerOf(skuCode);
  const ledgerBrief =
    ledger
      .filter((l) => l.status === "posted")
      .map(
        (l) =>
          `${new Date(l.ts).toISOString().slice(0, 10)} ${l.bizType} ${l.delta > 0 ? "+" : ""}${l.delta}${l.qc === false ? "（未质检）" : ""}`,
      )
      .join("\n") || "（无流水）";
  try {
    const text = await explainAttribution({
      styleName: row.sku.styleName,
      color: row.sku.color,
      size: row.sku.size,
      book: row.book,
      actual: row.actual,
      diff: row.diff,
      bucket: row.attr.bucket,
      badge: row.attr.badge,
      evidence: row.attr.ev,
      ledgerBrief,
    });
    return { ok: true, text: text || row.attr.reason };
  } catch (e) {
    return {
      ok: true,
      degraded: true,
      text:
        row.attr.reason +
        "\n\n（LLM 调用失败，已回退到检测器结论：" +
        (e instanceof Error ? e.message : String(e)) +
        "）",
    };
  }
}
