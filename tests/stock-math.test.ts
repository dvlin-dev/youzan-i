import { describe, expect, it } from "vitest";

import { runningBalances, sumDeltas } from "../lib/stock-math";

describe("库存守恒不变量（stock-math）", () => {
  it("I2 单一真相：库存 = 流水 delta 累加", () => {
    const rows = [
      { delta: 100, bizType: "期初" },
      { delta: 50, bizType: "采购到货" },
      { delta: -30, bizType: "销售出库" },
    ];
    expect(sumDeltas(rows)).toBe(120);
  });

  it("红冲纠错：追加反向流水后库存归正，且原始错账永久留痕（只增不删）", () => {
    const ledger = [
      { delta: 100, bizType: "期初" },
      { delta: 48, bizType: "采购到货" }, // 正确
      { delta: 48, bizType: "采购到货" }, // 重复录入（错账）
    ];
    expect(sumDeltas(ledger)).toBe(196); // 账面虚高

    // 纠错只能红冲（追加反向流水），不能删改原行
    const corrected = [...ledger, { delta: -48, bizType: "红冲·重复入库" }];
    expect(corrected.length).toBe(ledger.length + 1); // 行数只增不减
    expect(sumDeltas(corrected)).toBe(148); // 回到真实库存
  });

  it("逐笔结存正确，末笔结存 == 总累加", () => {
    const rows = [{ delta: 10 }, { delta: 5 }, { delta: -4 }];
    const rb = runningBalances(rows);
    expect(rb.map((x) => x.balance)).toEqual([10, 15, 11]);
    expect(rb[rb.length - 1].balance).toBe(sumDeltas(rows));
  });

  it("空流水派生为 0", () => {
    expect(sumDeltas([])).toBe(0);
    expect(runningBalances([])).toEqual([]);
  });
});
