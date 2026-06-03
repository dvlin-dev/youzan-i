import type { Attribution, Bucket } from "@/lib/stocktake/attribution";

export type Row = {
  skuCode: string;
  styleName: string;
  styleNo: string;
  color: string;
  size: string;
  book: number;
  actual: number;
  diff: number;
  val: number;
  resolved: boolean;
  attr: Attribution;
};

export type Summary = {
  loss: number;
  real: number;
  recover: number;
  buckets: Partial<Record<Bucket, { n: number; val: number }>>;
};

export const BUCKETS: [Bucket, string, string][] = [
  ["swap", "串色·货在", "info"],
  ["dup", "重复记账·账面虚高", "warn"],
  ["supplier", "供应商少发·可索赔", "warn"],
  ["misship", "疑错发·待核实", "warn"],
  ["transit", "在途·假差异", "teal"],
  ["loss", "实物损耗·真损失", "danger"],
];

export const STEPS = [
  "发起盘点",
  "盲盘录入实盘",
  "算差异 + AI 归因",
  "复核过账",
];

export const fmt = (t: string) =>
  new Date(t).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");

// 差异 / 金额列共用：负 → 损失红，其余 → 守恒绿（与 LedgerDrawer 的 diffColor 同源）。
export const signColor = (n: number) =>
  n < 0 ? "var(--danger-2)" : "var(--success)";
