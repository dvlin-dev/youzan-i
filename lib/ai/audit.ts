/**
 * 审计：AI 只读 SQL 工具的每一次调用都留痕（谁 / 何时 / 原始输入 / 结果）。
 * 既落**审计表** `query_audit`（持久、可追溯、运维可查），又同时打结构化日志（便于实时 tail）。
 * 审计写入永不抛错——留痕失败也绝不拖垮 query_sql 的响应（best-effort，包 try/catch）。
 */
import { db } from "@/lib/db/client";
import { queryAudit } from "@/lib/db/schema";

export type SqlAuditOutcome = "ok" | "rejected" | "error" | "disabled";

export type SqlAuditRecord = {
  actorId: string;
  actorName: string;
  role: string;
  sql: string;
  outcome: SqlAuditOutcome;
  reason?: string;
  rowCount?: number;
};

const SQL_CAP = 2000; // SQL 截断长度，防审计行膨胀。

/** 记录一次 query_sql 调用（落表 + 日志）。SQL 截断到 2000 字。返回 Promise，调用方可 await 确保落库。 */
export async function auditSqlQuery(rec: SqlAuditRecord): Promise<void> {
  const sql = rec.sql.slice(0, SQL_CAP);
  console.log(
    "[audit] query_sql " +
      JSON.stringify({
        at: new Date().toISOString(),
        actor: `${rec.actorName}(${rec.actorId})`,
        role: rec.role,
        outcome: rec.outcome,
        ...(rec.reason ? { reason: rec.reason } : {}),
        ...(rec.rowCount !== undefined ? { rows: rec.rowCount } : {}),
        sql,
      }),
  );
  try {
    await db.insert(queryAudit).values({
      actorId: rec.actorId,
      actorName: rec.actorName,
      role: rec.role,
      sql,
      outcome: rec.outcome,
      reason: rec.reason ?? null,
      rowCount: rec.rowCount ?? null,
    });
  } catch (e) {
    // 留痕失败不可影响主流程：仅记录，不抛。
    console.error("[audit] 写审计表失败（已忽略，不影响查询）：", e);
  }
}
