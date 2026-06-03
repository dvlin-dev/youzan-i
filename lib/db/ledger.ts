import { db } from "./client";
import { stockLedger, type NewLedger } from "./schema";

/**
 * append-only：写库存的唯一入口是「追加 posted 流水」。
 * 没有 UPDATE / DELETE——纠错追加红冲、待复核草稿走 `move_draft`（见 db/draft.ts）。
 */
export async function insertRows(rows: NewLedger[]) {
  if (!rows.length) return [];
  return db.insert(stockLedger).values(rows).returning();
}
