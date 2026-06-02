import { db } from "./client";
import { stockLedger, type NewLedger } from "./schema";
import { and, eq } from "drizzle-orm";

/** append-only：唯一的写库存入口是「追加流水」。 */
export async function insertRows(rows: NewLedger[]) {
  if (!rows.length) return [];
  return db.insert(stockLedger).values(rows).returning();
}

/** 复核通过：把某单据的 pending 流水置为 posted（reviewer≠creator 由调用方强校验）。 */
export async function setDocPosted(docNo: string, reviewerId: string) {
  return db
    .update(stockLedger)
    .set({ status: "posted", reviewerId })
    .where(and(eq(stockLedger.docNo, docNo), eq(stockLedger.status, "pending")))
    .returning();
}

/** 驳回：删除尚未入账的 pending 草稿（从未影响库存，非 posted 流水）。 */
export async function deletePendingDoc(docNo: string) {
  return db
    .delete(stockLedger)
    .where(and(eq(stockLedger.docNo, docNo), eq(stockLedger.status, "pending")))
    .returning();
}
