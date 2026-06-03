/**
 * 轻量审计：AI 工具层的关键动作留痕（谁 / 何时 / 原始输入 / 结果）。
 * 当前以结构化日志落地（与 seed 等一致），未来可替换为审计表而调用方不变。
 */

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

/** 记录一次 query_sql 调用（原始 SQL + 发起人 + 结果）。SQL 截断到 2000 字防日志膨胀。 */
export function auditSqlQuery(rec: SqlAuditRecord): void {
  console.log(
    "[audit] query_sql " +
      JSON.stringify({
        at: new Date().toISOString(),
        actor: `${rec.actorName}(${rec.actorId})`,
        role: rec.role,
        outcome: rec.outcome,
        ...(rec.reason ? { reason: rec.reason } : {}),
        ...(rec.rowCount !== undefined ? { rows: rec.rowCount } : {}),
        sql: rec.sql.slice(0, 2000),
      }),
  );
}
