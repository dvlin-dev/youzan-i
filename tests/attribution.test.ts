import { describe, expect, it } from "vitest";

import type { Sku, StockLedger } from "../lib/db/schema";
import {
  type AttrCtx,
  attribute,
  bizTypeOf,
} from "../lib/stocktake/attribution";

// —— 构造工具：补齐字段，保持类型安全（不使用 any）——
function led(p: Partial<StockLedger>): StockLedger {
  return {
    id: 0,
    skuCode: "X",
    delta: 0,
    bizType: "采购到货",
    docNo: "DOC",
    ts: new Date("2026-05-20T10:00:00+08:00"),
    operatorId: "op",
    reviewerId: "rv",
    status: "posted",
    scanned: true,
    qc: null,
    poRef: null,
    reversedBy: null,
    pdAdjust: false,
    createdAt: new Date("2026-05-20T10:00:00+08:00"),
    ...p,
  };
}
function meta(
  p: Partial<
    Pick<
      Sku,
      "skuCode" | "styleNo" | "styleName" | "color" | "size" | "costPrice"
    >
  >,
) {
  return {
    skuCode: "X",
    styleNo: "AW-T",
    styleName: "测试款",
    color: "藏青",
    size: "M",
    costPrice: 9900,
    ...p,
  };
}
const SNAP = "2026-05-30T16:00:00+08:00";
function ctx(p: Partial<AttrCtx>): AttrCtx {
  return {
    sku: meta({}),
    diff: 0,
    ledger: [],
    snapTs: SNAP,
    siblings: [],
    poOrdered: () => null,
    ...p,
  };
}

describe("AI 第 1 层确定性检测器回归（6 类成因）", () => {
  it("在途·假差异（transit）：快照后才入账的到货，等量正差异", () => {
    const a = attribute(
      ctx({
        diff: 40,
        ledger: [
          led({
            delta: 40,
            bizType: "采购到货",
            ts: new Date("2026-05-30T16:30:00+08:00"),
          }),
        ],
      }),
    );
    expect(a.bucket).toBe("transit");
    expect(a.real).toBe(false);
    expect(a.recover).toBe(false);
  });

  it("串色·可互换（swap）：同款号、等量反向差异", () => {
    const a = attribute(
      ctx({
        sku: meta({ skuCode: "AW-T-藏青-M", color: "藏青" }),
        diff: -25,
        siblings: [
          {
            skuCode: "AW-T-藏青-M",
            styleNo: "AW-T",
            color: "藏青",
            size: "M",
            diff: -25,
          },
          {
            skuCode: "AW-T-黑-M",
            styleNo: "AW-T",
            color: "黑",
            size: "M",
            diff: 25,
          },
        ],
      }),
    );
    expect(a.bucket).toBe("swap");
    expect(a.pair).toBe("AW-T-黑-M");
    expect(a.real).toBe(false);
  });

  it("重复入库（dup）：同到货单号两笔正流水", () => {
    const a = attribute(
      ctx({
        diff: -48,
        ledger: [
          led({ delta: 48, bizType: "采购到货", docNo: "IN-DUP" }),
          led({ delta: 48, bizType: "采购到货", docNo: "IN-DUP" }),
        ],
      }),
    );
    expect(a.bucket).toBe("dup");
    expect(a.real).toBe(false);
  });

  it("供应商少发·可索赔（supplier）：照单全收且未质检", () => {
    const a = attribute(
      ctx({
        diff: -60,
        ledger: [
          led({
            delta: 90,
            bizType: "采购到货",
            qc: false,
            poRef: "PO-1",
            docNo: "IN-90",
          }),
        ],
        poOrdered: (poRef) => (poRef === "PO-1" ? 90 : null),
      }),
    );
    expect(a.bucket).toBe("supplier");
    expect(a.recover).toBe(true);
    expect(a.real).toBe(false);
  });

  it("疑错发·待核实（misship）：编排款近期大额出库", () => {
    const a = attribute(
      ctx({
        sku: meta({
          skuCode: "AW2024-4408-黑-M",
          styleNo: "AW2024-4408",
          color: "黑",
        }),
        diff: -34,
        ledger: [led({ delta: -30, bizType: "销售出库", docNo: "OUT-1" })],
      }),
    );
    expect(a.bucket).toBe("misship");
    expect(a.recover).toBe(true);
  });

  it("实物损耗·真损失（loss）：检测器全不命中时诚实兜底", () => {
    const a = attribute(
      ctx({
        sku: meta({
          skuCode: "AW2024-7731-黑-L",
          styleNo: "AW2024-7731",
          costPrice: 15900,
        }),
        diff: -38,
        ledger: [
          led({ delta: 48, bizType: "期初", docNo: "INIT" }),
          led({ delta: 30, bizType: "采购到货", docNo: "IN-1" }),
          led({ delta: -10, bizType: "销售出库", docNo: "OUT-1" }),
        ],
      }),
    );
    expect(a.bucket).toBe("loss");
    expect(a.real).toBe(true); // 真实物净损失，该认
  });

  it("bizTypeOf 覆盖全部 bucket 且各不相同", () => {
    const buckets = [
      "swap",
      "dup",
      "supplier",
      "misship",
      "transit",
      "loss",
    ] as const;
    const labels = buckets.map((b) => bizTypeOf(b));
    expect(new Set(labels).size).toBe(buckets.length);
    labels.forEach((l) => expect(l.startsWith("盘点")).toBe(true));
  });
});
