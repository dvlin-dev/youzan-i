import { describe, it, expect } from "vitest";
import { can, type Role } from "../lib/constants";

/**
 * RC-06 + AI 越权红线（策略层）：权限矩阵是「权限在数据层生效」的唯一真相，
 * tools.ts 的工具按角色挂载、actions.ts 的写动作拦截都从这里派生。
 */
const ROLES: Role[] = ["warehouse", "buyer", "admin"];

describe("RBAC 权限矩阵 can.*（RC-06 / 越权红线）", () => {
  // 期望矩阵：仓管只读库存+录出入库（无成本/采购/盘点）；采购看成本+采购+对账（不录出入库）；老板全开。
  const expected: Record<Role, Record<keyof typeof can, boolean>> = {
    warehouse: { cost: false, recon: false, po: false, move: true, postStocktake: false },
    buyer: { cost: true, recon: true, po: true, move: false, postStocktake: false },
    admin: { cost: true, recon: true, po: true, move: true, postStocktake: true },
  };

  for (const role of ROLES) {
    it(`${role} 的权限位与设计一致`, () => {
      for (const key of Object.keys(expected[role]) as (keyof typeof can)[]) {
        expect(can[key](role), `${role}.${key}`).toBe(expected[role][key]);
      }
    });
  }

  it("成本价对仓管关闭（字段脱敏的策略依据）", () => {
    expect(can.cost("warehouse")).toBe(false);
    expect(can.cost("buyer")).toBe(true);
    expect(can.cost("admin")).toBe(true);
  });

  it("采购不可录出入库、仓管不可对账/采购（角色越权红线）", () => {
    expect(can.move("buyer")).toBe(false); // 采购越权录出入库 → 策略层拒
    expect(can.recon("warehouse")).toBe(false); // 仓管越权看对账 → 拒
    expect(can.po("warehouse")).toBe(false); // 仓管越权动采购单 → 拒
  });

  it("仅老板可盘点过账", () => {
    expect(ROLES.filter((r) => can.postStocktake(r))).toEqual(["admin"]);
  });
});
