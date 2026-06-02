import { db } from "./client";
import {
  sku,
  stockLedger,
  purchaseOrder,
  poLine,
  stocktake,
  stocktakeCount,
  type StockLedger,
  type Sku,
} from "./schema";
import { eq, sql, asc, desc } from "drizzle-orm";

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

export async function pendingDocs(): Promise<Record<string, StockLedger[]>> {
  const rows = await db
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.status, "pending"))
    .orderBy(desc(stockLedger.id));
  const m: Record<string, StockLedger[]> = {};
  for (const r of rows) (m[r.docNo] ??= []).push(r);
  return m;
}

export async function listPos() {
  const pos = await db.select().from(purchaseOrder).orderBy(desc(purchaseOrder.createdAt));
  const lines = await db.select().from(poLine);
  return pos.map((p) => ({ ...p, lines: lines.filter((l) => l.poNo === p.poNo) }));
}

export async function getPo(poNo: string) {
  const [p] = await db.select().from(purchaseOrder).where(eq(purchaseOrder.poNo, poNo));
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
