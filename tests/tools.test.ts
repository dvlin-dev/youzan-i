import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "../lib/constants";

/**
 * 工具层回归：getToolSpecs 按角色挂载（越权红线——采购拿不到写工具、仓管拿不到对账工具），
 * 以及 query_sql 的执行守门（guard 拒绝 / 未配置停用 / 正常返回 / 仓管输出脱敏 / 全程审计）。
 *
 * 这里 mock 掉 tools.ts 依赖的 DB/动作边界，使其能在无数据库的纯测试环境加载；
 * sql-guard / constants 用真实实现（它们是纯函数，正是要回归的安全逻辑）。
 */
const h = vi.hoisted(() => ({
  runReadonlyQuery: vi.fn<(sql: string, role: Role) => Promise<{ rows: Record<string, unknown>[]; truncated: boolean }>>(),
  readonlyEnabled: vi.fn<(role: Role) => boolean>(() => true),
  auditSqlQuery: vi.fn(),
  submitMove: vi.fn(async () => ({ ok: true, docNo: "IN-TEST", msg: "ok" })),
}));

vi.mock("@/lib/actions", () => ({ submitMove: h.submitMove }));
vi.mock("@/lib/db/queries", () => ({ stockMap: vi.fn(async () => ({})), levelOf: vi.fn(() => "ok") }));
vi.mock("@/lib/stocktake/engine", () => ({ loadStocktakeView: vi.fn(async () => null), summarize: vi.fn() }));
vi.mock("@/lib/db/readonly", () => ({
  readonlyEnabled: h.readonlyEnabled,
  runReadonlyQuery: h.runReadonlyQuery,
  READONLY_ROW_CAP: 200,
}));
vi.mock("@/lib/ai/audit", () => ({ auditSqlQuery: h.auditSqlQuery }));

import { getToolSpecs, type ToolCtx } from "@/lib/ai/tools";

function ctx(role: Role): ToolCtx {
  return { role, skus: [], skuSet: new Set(), recorded: [], actor: { id: "u_test", name: "测试员" } };
}
const names = (role: Role) => getToolSpecs(ctx(role)).map((s) => s.name).sort();
const qsql = (role: Role) => getToolSpecs(ctx(role)).find((s) => s.name === "query_sql")!;

beforeEach(() => {
  vi.clearAllMocks();
  h.readonlyEnabled.mockReturnValue(true);
});

describe("getToolSpecs 按角色挂载（越权红线）", () => {
  it("仓管：读库存 + 录出入库 + 只读 SQL，无对账", () => {
    expect(names("warehouse")).toEqual(["low_stock", "query_sql", "query_stock", "record_move"].sort());
  });
  it("采购：读库存 + 对账 + 只读 SQL，**拿不到** record_move 写工具", () => {
    const n = names("buyer");
    expect(n).toEqual(["low_stock", "query_sql", "query_stock", "recon_summary"].sort());
    expect(n).not.toContain("record_move");
  });
  it("老板：全部 5 个工具", () => {
    expect(names("admin")).toEqual(["low_stock", "query_sql", "query_stock", "recon_summary", "record_move"].sort());
  });
  it("query_sql 对所有角色都挂载（按角色脱敏在内部生效）", () => {
    for (const r of ["warehouse", "buyer", "admin"] as Role[]) expect(names(r)).toContain("query_sql");
  });
});

describe("query_sql 执行守门", () => {
  it("guard 拒绝写语句：不落到连接层、记审计 rejected", async () => {
    const out = await qsql("admin").execute({ sql: "drop table sku" });
    expect(out).toMatch(/已拒绝/);
    expect(h.runReadonlyQuery).not.toHaveBeenCalled();
    expect(h.auditSqlQuery).toHaveBeenCalledWith(expect.objectContaining({ outcome: "rejected" }));
  });

  it("未配置只读连接：停用且记审计 disabled，绝不查库", async () => {
    h.readonlyEnabled.mockReturnValue(false);
    const out = await qsql("admin").execute({ sql: "select 1" });
    expect(out).toMatch(/只读 SQL 暂不可用/);
    expect(h.runReadonlyQuery).not.toHaveBeenCalled();
    expect(h.auditSqlQuery).toHaveBeenCalledWith(expect.objectContaining({ outcome: "disabled" }));
  });

  it("正常 SELECT：调用连接层并格式化返回，记审计 ok", async () => {
    h.runReadonlyQuery.mockResolvedValue({ rows: [{ color: "藏青", n: 3 }], truncated: false });
    const out = await qsql("admin").execute({ sql: "select color, count(*) n from sku group by color" });
    expect(h.runReadonlyQuery).toHaveBeenCalledOnce();
    expect(out).toMatch(/查询成功：1 行/);
    expect(out).toContain("藏青");
    expect(h.auditSqlQuery).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ok", rowCount: 1 }));
  });

  it("输出脱敏：仓管结果里的 cost_price 被剔除，老板保留（堵 SELECT * 口子）", async () => {
    h.runReadonlyQuery.mockResolvedValue({ rows: [{ sku_code: "X", cost_price: 12000 }], truncated: false });
    const wh = await qsql("warehouse").execute({ sql: "select * from sku" });
    expect(wh).not.toMatch(/cost_price|12000/);

    h.runReadonlyQuery.mockResolvedValue({ rows: [{ sku_code: "X", cost_price: 12000 }], truncated: false });
    const ad = await qsql("admin").execute({ sql: "select * from sku" });
    expect(ad).toMatch(/cost_price/);
    expect(ad).toContain("12000");
  });

  it("空 sql 也进入 execute 并被审计（无 .min(1) 盲区）", async () => {
    const out = await qsql("warehouse").execute({ sql: "" });
    expect(out).toMatch(/已拒绝|SQL 为空/);
    expect(h.auditSqlQuery).toHaveBeenCalledWith(expect.objectContaining({ outcome: "rejected" }));
  });
});
