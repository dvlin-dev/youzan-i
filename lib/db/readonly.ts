import { neon } from "@neondatabase/serverless";

import type { Role } from "@/lib/constants";

/**
 * query_sql 的「连接层」——纵深防御的根本保证（DB 层物理拒写 + 物理脱敏）。
 *
 * 用**仅 GRANT SELECT** 的只读角色执行 AI 生成的 SELECT：即便语句层（lib/ai/sql-guard.ts）被绕过，
 * DB 也物理拒写、且读不到未授权的表/列。按角色分两条连接（见 lib/db/setup-readonly.ts）：
 *   · 采购/老板 → DATABASE_URL_READONLY     （业务表，无 app_user 口令表）
 *   · 仓管      → DATABASE_URL_READONLY_WH  （sku 走去 cost_price 的脱敏视图；无采购单/盘点）
 * 仓管这条连接里 cost_price 这一列**在 DB 层就不存在**——连 to_jsonb(sku)、sku::text 也带不出成本价。
 *
 * 额外两道兜底：`readOnly: true` 事务 + `statement_timeout` + 外层 `LIMIT` 包裹。
 */

const fullUrl = process.env.DATABASE_URL_READONLY;
const whUrl = process.env.DATABASE_URL_READONLY_WH;
const roFull = fullUrl ? neon(fullUrl) : null;
const roWh = whUrl ? neon(whUrl) : null;

/** 按角色取只读连接：仓管走脱敏连接，其余走全量业务连接。 */
function clientFor(role: Role) {
  return role === "warehouse" ? roWh : roFull;
}

/** 当前角色的只读连接是否已配置——没配则该角色的 query_sql 停用（绝不退回可写连接）。 */
export function readonlyEnabled(role: Role): boolean {
  return clientFor(role) != null;
}

/** 返回行数上限：超过即截断并告知模型。 */
export const READONLY_ROW_CAP = 200;
/** 语句超时（毫秒）：挡慢查询/拖库。 */
const READONLY_TIMEOUT_MS = 5000;

export type ReadonlyQueryResult = {
  rows: Record<string, unknown>[];
  truncated: boolean;
};

/**
 * 在只读角色 + READ ONLY 事务 + statement_timeout + 行数上限下执行一条**已校验**的 SELECT。
 * `validatedSelect` 必须已过 guardReadonlySql（单条、无注释、无尾分号）；按 role 选脱敏/全量连接。
 */
export async function runReadonlyQuery(
  validatedSelect: string,
  role: Role,
): Promise<ReadonlyQueryResult> {
  const roSql = clientFor(role);
  if (!roSql) throw new Error("只读连接未配置（DATABASE_URL_READONLY[_WH]）");

  // 外层包裹强制行数上限：内层即便没有 LIMIT，也最多取 CAP+1 行（多取 1 行用于判断是否截断）。
  const wrapped = `select * from (${validatedSelect}) as _jxc_guard limit ${READONLY_ROW_CAP + 1}`;

  const results = await roSql.transaction(
    (txn) => [
      txn(`set local statement_timeout = ${READONLY_TIMEOUT_MS}`),
      txn(wrapped),
    ],
    { readOnly: true },
  );

  const rows = (results[1] ?? []) as Record<string, unknown>[];
  const truncated = rows.length > READONLY_ROW_CAP;
  return {
    rows: truncated ? rows.slice(0, READONLY_ROW_CAP) : rows,
    truncated,
  };
}
