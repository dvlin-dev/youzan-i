import { db, rawSql } from "./client";
import { moveDraft, type MoveDraft, type NewMoveDraft } from "./schema";
import { eq } from "drizzle-orm";

/** 暂存待复核草稿（从不进入不可变 ledger）。 */
export async function insertDraft(rows: NewMoveDraft[]) {
  if (!rows.length) return [];
  return db.insert(moveDraft).values(rows).returning();
}

/** 某单据的草稿明细。 */
export async function getDraft(docNo: string): Promise<MoveDraft[]> {
  return db.select().from(moveDraft).where(eq(moveDraft.docNo, docNo));
}

/** 某采购单是否已有待复核的到货草稿（防重复登记）。 */
export async function getDraftsByPo(poNo: string): Promise<MoveDraft[]> {
  return db.select().from(moveDraft).where(eq(moveDraft.poRef, poNo));
}

/** 驳回：删除草稿（从未影响库存）。 */
export async function deleteDraft(docNo: string) {
  return db.delete(moveDraft).where(eq(moveDraft.docNo, docNo)).returning();
}

/** 全部待复核草稿，按单据号分组。 */
export async function draftDocs(): Promise<Record<string, MoveDraft[]>> {
  const rows = await db.select().from(moveDraft).orderBy(moveDraft.id);
  const m: Record<string, MoveDraft[]> = {};
  for (const r of rows) (m[r.docNo] ??= []).push(r);
  return m;
}

export type PostedDraftRow = { sku_code: string; delta: number; po_ref: string | null };

/**
 * 原子过账（守恒护栏）：在**单条 SQL 语句**里完成
 *   1) 校验该草稿落账后，每个受影响 SKU 的库存（= 已 posted 流水累加 + 本单 delta）不为负；
 *   2) 仅当全部不为负时，把草稿作为 posted 行**追加**进 stock_ledger。
 * neon-http 每条语句即一个事务、读到一致快照，因此「校验 + 追加」不可分割——
 * 杜绝两张待复核出库单各自初检通过、复核后双双打穿库存的并发缺口。
 * 返回实际追加的行；为空 = 被守恒拦截（库存不足）。
 */
export async function postDraftAtomic(docNo: string, reviewerId: string): Promise<PostedDraftRow[]> {
  const rows = (await rawSql`
    INSERT INTO stock_ledger
      (sku_code, delta, biz_type, doc_no, operator_id, reviewer_id, po_ref, qc, scanned, status)
    SELECT sku_code, delta, biz_type, doc_no, operator_id, ${reviewerId}, po_ref, qc, scanned, 'posted'
    FROM move_draft d
    WHERE d.doc_no = ${docNo}
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT g.sku_code,
                 (SELECT COALESCE(SUM(l.delta), 0)
                    FROM stock_ledger l
                   WHERE l.status = 'posted' AND l.sku_code = g.sku_code) + g.dsum AS final_qty
          FROM (
            SELECT sku_code, SUM(delta) AS dsum
            FROM move_draft
            WHERE doc_no = ${docNo}
            GROUP BY sku_code
          ) g
        ) chk
        WHERE chk.final_qty < 0
      )
    RETURNING sku_code, delta, po_ref
  `) as PostedDraftRow[];
  return rows;
}
