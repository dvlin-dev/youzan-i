import { describe, it, expect } from "vitest";
import { guardReadonlySql } from "../lib/ai/sql-guard";
import type { Role } from "../lib/constants";

const admin: Role = "admin";
const buyer: Role = "buyer";
const warehouse: Role = "warehouse";

function ok(sql: string, role: Role = admin) {
  const r = guardReadonlySql(sql, role);
  expect(r.ok, `期望放行：${sql}\n实际：${r.ok ? "" : r.reason}`).toBe(true);
  return r;
}
function rejected(sql: string, role: Role = admin) {
  const r = guardReadonlySql(sql, role);
  expect(r.ok, `期望拒绝：${sql}`).toBe(false);
  return r as { ok: false; reason: string };
}

describe("guardReadonlySql · 放行正常只读查询", () => {
  it("简单 SELECT", () => ok("SELECT sku_code, color FROM sku"));
  it("聚合 + GROUP BY + ORDER BY + LIMIT", () =>
    ok("select color, sum(delta) from stock_ledger where status='posted' group by color order by 2 desc limit 10"));
  it("WITH CTE", () =>
    ok("WITH t AS (SELECT sku_code, SUM(delta) q FROM stock_ledger GROUP BY sku_code) SELECT * FROM t WHERE q < 0"));
  it("JOIN", () =>
    ok("select s.style_name, l.delta from stock_ledger l join sku s on s.sku_code = l.sku_code"));
  it("前导括号 / UNION", () => ok("(SELECT 1 AS n) UNION (SELECT 2)"));
  it("结尾单个分号允许", () => ok("SELECT 1;"));
  it("字面量里出现分号不算多语句", () =>
    ok("SELECT * FROM sku WHERE color = 'a;b'"));
  it("字面量里出现写关键字不误伤", () =>
    ok("SELECT 'drop table sku' AS note, count(*) FROM sku"));
});

describe("guardReadonlySql · 拒绝写 / DDL", () => {
  for (const sql of [
    "INSERT INTO sku VALUES (1)",
    "UPDATE sku SET cost_price = 0",
    "DELETE FROM stock_ledger",
    "DROP TABLE sku",
    "ALTER TABLE sku ADD COLUMN x int",
    "CREATE TABLE x (id int)",
    "TRUNCATE stock_ledger",
    "GRANT SELECT ON sku TO public",
    "MERGE INTO sku USING x ON true WHEN MATCHED THEN DELETE",
    "SELECT * INTO new_tbl FROM sku",
  ]) {
    it(sql, () => rejected(sql));
  }
});

describe("guardReadonlySql · 拒绝多语句 / 注释绕过", () => {
  it("分号分隔多语句", () => rejected("SELECT 1; DROP TABLE sku"));
  it("行注释绕过", () => rejected("SELECT 1 -- ; DROP TABLE sku\n"));
  it("块注释", () => rejected("SELECT /* x */ 1"));
  it("块注释藏写", () => rejected("SELECT 1 /*\n*/ ; DELETE FROM sku"));
});

describe("guardReadonlySql · 拒绝非 SELECT 开头", () => {
  for (const sql of ["TABLE sku", "VALUES (1),(2)", "EXPLAIN ANALYZE SELECT 1", "SHOW ALL", "COPY sku TO STDOUT"]) {
    it(sql, () => rejected(sql));
  }
});

describe("guardReadonlySql · 拒绝危险函数 / 锁", () => {
  for (const sql of [
    "SELECT pg_sleep(10)",
    "SELECT pg_sleep_for('10 seconds')",
    "SELECT pg_sleep_until(now() + interval '1 day')",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT set_config('x','y',false)",
    "SELECT dblink('','')",
    "SELECT * FROM sku FOR UPDATE",
    "SELECT * FROM sku FOR SHARE",
  ]) {
    it(sql, () => rejected(sql));
  }
});

describe("guardReadonlySql · 拒绝统计目录（pg_stats 暴露列采样值）", () => {
  for (const role of [admin, buyer, warehouse] as Role[]) {
    it(`pg_stats / pg_statistic · ${role}`, () => {
      rejected("select most_common_vals from pg_stats where attname = 'password_hash'", role);
      rejected("select most_common_vals from pg_statistic limit 1", role);
    });
  }
});

describe("guardReadonlySql · 角色脱敏（数据层）", () => {
  it("人人都不能读 app_user / password_hash", () => {
    rejected("SELECT * FROM app_user", admin);
    rejected("SELECT password_hash FROM app_user", admin);
    rejected("SELECT password_hash FROM app_user", buyer);
  });
  it("仓管不能读 cost_price", () => rejected("SELECT cost_price FROM sku", warehouse));
  it("仓管不能读采购单 / 盘点", () => {
    rejected("SELECT * FROM purchase_order", warehouse);
    rejected("SELECT * FROM po_line", warehouse);
    rejected("SELECT * FROM stocktake_count", warehouse);
  });
  it("采购 / 老板可读 cost_price", () => {
    ok("SELECT cost_price FROM sku", buyer);
    ok("SELECT cost_price FROM sku", admin);
  });
  it("采购可读采购单", () => ok("SELECT supplier FROM purchase_order", buyer));
  it("仓管能读自己的库存表", () => ok("SELECT sku_code, color FROM sku", warehouse));
});

describe("guardReadonlySql · 杂项", () => {
  it("空串拒绝", () => rejected("   "));
  it("通过后去掉结尾分号", () => {
    const r = guardReadonlySql("SELECT 1;", admin);
    expect(r.ok && r.sql).toBe("SELECT 1");
  });
});
