/**
 * 库存浏览视图的纯逻辑（无 IO、无 React、可单测）：SKU → 款分组着色 + 排序，以及搜索/低库存筛选。
 * 着色仅服务展示，不进真相源；排序按 SIZE_ORDER。
 */
import type { SkuRow, StyleGroup } from "@/components/StockBrowser/types";
import { SIZE_ORDER } from "@/lib/constants";

const TINT = [
  "#0E6E63",
  "#A86E14",
  "#9C5A2A",
  "#3F6E4A",
  "#3A5A78",
  "#8C3A4A",
  "#4A6E2E",
  "#B23F2C",
];

/** 把扁平 SKU 列表按款号聚合成款组（带 TINT 着色与 SIZE_ORDER 尺码排序）。 */
export function groupSkusByStyle(skus: SkuRow[]): StyleGroup[] {
  const m = new Map<string, StyleGroup>();
  for (const s of skus) {
    let g = m.get(s.styleNo);
    if (!g) {
      g = {
        styleNo: s.styleNo,
        styleName: s.styleName,
        category: s.category,
        costPrice: s.costPrice,
        tagPrice: s.tagPrice,
        tint: TINT[m.size % TINT.length],
        colors: [],
        sizes: [],
        items: [],
      };
      m.set(s.styleNo, g);
    }
    g.items.push(s);
    if (!g.colors.includes(s.color)) g.colors.push(s.color);
    if (!g.sizes.includes(s.size)) g.sizes.push(s.size);
  }
  return [...m.values()].map((g) => ({
    ...g,
    sizes: g.sizes.sort(
      (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
    ),
  }));
}

/** 按关键词（款号/品名/品类/条码）与「只看低库存」筛选款组。 */
export function filterStyleGroups(
  groups: StyleGroup[],
  { q, lowOnly }: { q: string; lowOnly: boolean },
): StyleGroup[] {
  const ql = q.trim().toLowerCase();
  let list = groups.filter(
    (g) =>
      !ql ||
      (g.styleNo + g.styleName + g.category).toLowerCase().includes(ql) ||
      g.items.some((s) => s.skuCode.toLowerCase().includes(ql)),
  );
  if (lowOnly) list = list.filter((g) => g.items.some((s) => s.level !== "ok"));
  return list;
}
