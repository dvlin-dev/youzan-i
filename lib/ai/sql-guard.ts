import type { Role } from "@/lib/constants";

/**
 * query_sql 的「语句层 + 数据层」校验（纵深防御第 1、3 层）。
 *
 * 这是纯函数、可单测，不碰数据库。它只负责：
 *   1. 字面量/注释感知地扫描 SQL（'…' / "…" / $tag$…$tag$ 内的内容不参与关键字判定）；
 *   2. 只放行**单条**、以 `SELECT` 或 `WITH` 开头的只读查询；
 *   3. 拒绝写/DDL/会话/事务关键字、危险函数、行级锁、多语句、注释；
 *   4. 按当前角色做表/列脱敏（与 lib/constants 的 can.* 对齐）。
 *
 * 真正「只读」的硬保证在连接层（独立只读角色，见 lib/db/readonly.ts）——
 * 即便本层被绕过，DB 也物理拒写。本层负责给清晰报错、挡多语句/注入/越权读/DoS 函数。
 */

export type SqlGuardResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

/** 写 / DDL / 会话 / 事务 / 取数副作用关键字——出现即拒（整词匹配）。 */
const FORBIDDEN_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
  "GRANT", "REVOKE", "COMMENT", "REINDEX", "VACUUM", "ANALYZE", "CLUSTER",
  "COPY", "MERGE", "CALL", "DO", "EXECUTE", "PREPARE", "DEALLOCATE",
  "LISTEN", "NOTIFY", "UNLISTEN", "LOCK", "SET", "RESET", "BEGIN", "START",
  "COMMIT", "ROLLBACK", "SAVEPOINT", "REFRESH", "IMPORT", "INTO", "SECURITY",
];

/** 危险函数：文件 / 网络 / 睡眠(DoS) / 改配置——只读角色已物理拒写，这里给清晰报错并挡拖库。 */
const BLOCKED_FUNCTIONS = [
  // pg_sleep 全家（pg_sleep / pg_sleep_for / pg_sleep_until）——\b 边界不含后缀，逐个列。
  "pg_sleep", "pg_sleep_for", "pg_sleep_until",
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file",
  "lo_import", "lo_export", "dblink", "pg_terminate_backend", "pg_cancel_backend",
  "pg_reload_conf", "set_config", "pg_logical_emit_message",
];

/** 角色相关的表/列脱敏：与 can.cost / can.po / can.recon 对齐，让自由 SQL 不绕过页面级 RBAC。 */
function deniedIdentifiers(role: Role): string[] {
  // 任何角色都不可读：用户表 / 口令哈希 / 系统口令目录 / **统计目录（pg_stats 暴露列采样值）**。
  // 统计目录会泄露 most_common_vals / histogram_bounds 等真实样本值，且 DB 虽按列权限过滤，仍整体挡掉更稳。
  const base = [
    "app_user", "password_hash", "pg_authid", "pg_shadow",
    "pg_stats", "pg_statistic", "pg_stats_ext", "pg_stats_ext_exprs",
    "pg_statistic_ext", "pg_statistic_ext_data",
  ];
  if (role === "warehouse") {
    // 仓管：看不到成本价、采购单、盘点（与 can.cost/can.po/can.recon = false 对齐）
    return [...base, "cost_price", "purchase_order", "po_line", "stocktake", "stocktake_count"];
  }
  return base;
}

/**
 * 单遍扫描：把字符串字面量 / 美元引用体替换为空白、保留双引号标识符内容，
 * 同时记录是否含注释、字面量外的分号数。返回的 `code` 仅用于关键字/标识符判定，**不可执行**。
 */
function scan(sql: string): { code: string; hasComment: boolean; semicolons: number } {
  let code = "";
  let hasComment = false;
  let semicolons = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];

    // 行注释 --
    if (c === "-" && c2 === "-") {
      hasComment = true;
      i += 2;
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    // 块注释 /* */（PG 可嵌套）
    if (c === "/" && c2 === "*") {
      hasComment = true;
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; continue; }
        if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; continue; }
        i++;
      }
      continue;
    }
    // 单引号字符串 '…''…' —— 整体抹成空白
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      code += " ";
      continue;
    }
    // 双引号标识符 "…""…" —— 保留内容（标识符仍要参与脱敏判定，但不会被当关键字执行）
    if (c === '"') {
      code += '"';
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') { code += '""'; i += 2; continue; }
        if (sql[i] === '"') { code += '"'; i++; break; }
        code += sql[i]; i++;
      }
      continue;
    }
    // 美元引用体 $tag$…$tag$ —— 整体抹成空白（防止藏分号/关键字）
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) { code += " "; i = n; continue; }
        i = end + tag.length;
        code += " ";
        continue;
      }
    }

    if (c === ";") { semicolons++; code += ";"; i++; continue; }
    code += c;
    i++;
  }

  return { code, hasComment, semicolons };
}

/**
 * 校验并清理一条只读 SQL。通过则返回去掉结尾分号的原始语句（可交给连接层包裹执行）；
 * 不通过返回中文 reason。
 */
export function guardReadonlySql(raw: string, role: Role): SqlGuardResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "SQL 为空" };

  const { code, hasComment } = scan(trimmed);

  if (hasComment) {
    return { ok: false, reason: "不允许 SQL 注释（-- 或 /* */），以防注释绕过校验" };
  }

  // 去掉单个结尾分号；其余分号 = 多语句
  const body = code.replace(/;\s*$/, "");
  if (body.includes(";")) {
    return { ok: false, reason: "只允许单条语句（检测到多条 SQL 或分号分隔）" };
  }

  // 必须以 SELECT 或 WITH 开头（允许前导空白与括号）
  const head = body.replace(/^[\s(]+/, "").toUpperCase();
  if (!/^SELECT\b/.test(head) && !/^WITH\b/.test(head)) {
    return { ok: false, reason: "只允许只读查询：语句须以 SELECT 或 WITH 开头" };
  }

  const upper = code.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return { ok: false, reason: `不允许的关键字 ${kw}：query_sql 只读，写/DDL/会话语句一律拒绝` };
    }
  }
  // 行级锁 FOR UPDATE / FOR SHARE
  if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/.test(upper)) {
    return { ok: false, reason: "不允许行级锁（FOR UPDATE / FOR SHARE）" };
  }

  const lower = code.toLowerCase();
  for (const fn of BLOCKED_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\b`).test(lower)) {
      return { ok: false, reason: `不允许的函数 ${fn}（文件/网络/睡眠/改配置类）` };
    }
  }

  for (const id of deniedIdentifiers(role)) {
    if (new RegExp(`\\b${id}\\b`, "i").test(code)) {
      return { ok: false, reason: `当前角色无权访问：${id}` };
    }
  }

  return { ok: true, sql: trimmed.replace(/;\s*$/, "") };
}
