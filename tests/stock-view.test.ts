import { describe, expect, it } from "vitest";

import type { SkuRow } from "../components/StockBrowser/types";
import { filterStyleGroups, groupSkusByStyle } from "../lib/stock-view";

function sku(p: Partial<SkuRow>): SkuRow {
  return {
    skuCode: "X",
    styleNo: "AW-1",
    styleName: "测试款",
    category: "针织衫",
    color: "藏青",
    size: "M",
    costPrice: 9900,
    tagPrice: 19900,
    safetyStock: 25,
    qty: 50,
    level: "ok",
    ...p,
  };
}

describe("groupSkusByStyle · 按款聚合", () => {
  it("同款号聚合，收集去重的颜色/尺码，尺码按 SIZE_ORDER 排序", () => {
    const groups = groupSkusByStyle([
      sku({ skuCode: "A-黑-L", styleNo: "A", color: "黑", size: "L" }),
      sku({ skuCode: "A-黑-S", styleNo: "A", color: "黑", size: "S" }),
      sku({ skuCode: "A-白-M", styleNo: "A", color: "白", size: "M" }),
      sku({ skuCode: "B-蓝-S", styleNo: "B", color: "蓝", size: "S" }),
    ]);
    expect(groups.map((g) => g.styleNo)).toEqual(["A", "B"]);
    const a = groups[0];
    expect(a.colors).toEqual(["黑", "白"]); // 去重、保留首现顺序
    expect(a.sizes).toEqual(["S", "M", "L"]); // SIZE_ORDER 排序，非插入序
    expect(a.items).toHaveLength(3);
    expect(a.tint).toBeTruthy();
  });
  it("空输入 → 空数组", () => {
    expect(groupSkusByStyle([])).toEqual([]);
  });
});

describe("filterStyleGroups · 搜索 + 只看低库存", () => {
  const groups = groupSkusByStyle([
    sku({
      skuCode: "AW-1-藏青-M",
      styleNo: "AW-1",
      styleName: "加绒针织衫",
      category: "针织衫",
      level: "ok",
    }),
    sku({
      skuCode: "AW-2-黑-M",
      styleNo: "AW-2",
      styleName: "牛仔裤",
      category: "牛仔",
      level: "warn",
    }),
  ]);

  it("无关键词、不限低库存 → 全部返回", () => {
    expect(filterStyleGroups(groups, { q: "", lowOnly: false })).toHaveLength(
      2,
    );
  });
  it("按品名关键词筛选", () => {
    const r = filterStyleGroups(groups, { q: "牛仔", lowOnly: false });
    expect(r.map((g) => g.styleNo)).toEqual(["AW-2"]);
  });
  it("按 skuCode 关键词筛选", () => {
    const r = filterStyleGroups(groups, { q: "aw-1-藏青", lowOnly: false });
    expect(r.map((g) => g.styleNo)).toEqual(["AW-1"]);
  });
  it("只看低库存 → 只留含非 ok 行的款", () => {
    const r = filterStyleGroups(groups, { q: "", lowOnly: true });
    expect(r.map((g) => g.styleNo)).toEqual(["AW-2"]);
  });
});
