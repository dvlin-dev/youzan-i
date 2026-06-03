import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "./client";
import {
  type MoveDraft,
  type Sku,
  type StockLedger,
  moveDraft,
  poLine,
  purchaseOrder,
  sku,
  stockLedger,
  stocktake,
  stocktakeCount,
} from "./schema";

export async function allSkus(): Promise<Sku[]> {
  return db.select().from(sku);
}

/** 库存 = 流水累加（仅 posted）。返回 skuCode → 数量。 */
export async function stockMap(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      skuCode: stockLedger.skuCode,
      qty: sql<number>`coalesce(sum(${stockLedger.delta}),0)::int`,
    })
    .from(stockLedger)
    .where(eq(stockLedger.status, "posted"))
    .groupBy(stockLedger.skuCode);
  const m: Record<string, number> = {};
  for (const r of rows) m[r.skuCode] = Number(r.qty);
  return m;
}

export async function ledgerOf(skuCode: string): Promise<StockLedger[]> {
  return db
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.skuCode, skuCode))
    .orderBy(asc(stockLedger.ts), asc(stockLedger.id));
}

export function levelOf(qty: number, safety: number): "ok" | "warn" | "danger" {
  if (qty <= 0) return "danger";
  if (qty < safety) return "warn";
  return "ok";
}

/** 待复核单据 = 草稿（move_draft），按单据号分组。 */
export async function pendingDocs(): Promise<Record<string, MoveDraft[]>> {
  const rows = await db.select().from(moveDraft).orderBy(desc(moveDraft.id));
  const m: Record<string, MoveDraft[]> = {};
  for (const r of rows) (m[r.docNo] ??= []).push(r);
  return m;
}

/** 某采购单各 SKU 的「已到货量」= 该单 posted 入库流水累加（单一真相）。 */
export async function receivedByPo(
  poNo: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      skuCode: stockLedger.skuCode,
      qty: sql<number>`coalesce(sum(${stockLedger.delta}),0)::int`,
    })
    .from(stockLedger)
    .where(and(eq(stockLedger.poRef, poNo), eq(stockLedger.status, "posted")))
    .groupBy(stockLedger.skuCode);
  const m: Record<string, number> = {};
  for (const r of rows) m[r.skuCode] = Number(r.qty);
  return m;
}

export async function listPos() {
  const pos = await db
    .select()
    .from(purchaseOrder)
    .orderBy(desc(purchaseOrder.createdAt));
  const lines = await db.select().from(poLine);
  return pos.map((p) => ({
    ...p,
    lines: lines.filter((l) => l.poNo === p.poNo),
  }));
}

export async function getPo(poNo: string) {
  const [p] = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.poNo, poNo));
  if (!p) return null;
  const lines = await db.select().from(poLine).where(eq(poLine.poNo, poNo));
  return { ...p, lines };
}

/** 最近一次盘点单 + 其实盘明细。 */
export async function activeStocktake() {
  const [st] = await db
    .select()
    .from(stocktake)
    .orderBy(desc(stocktake.countedAt))
    .limit(1);
  if (!st) return null;
  const counts = await db
    .select()
    .from(stocktakeCount)
    .where(eq(stocktakeCount.pdNo, st.pdNo));
  return { ...st, counts };
}

export async function recentLedger(limit = 8): Promise<StockLedger[]> {
  return db
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.status, "posted"))
    .orderBy(desc(stockLedger.id))
    .limit(limit);
}
