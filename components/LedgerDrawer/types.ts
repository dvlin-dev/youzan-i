import type { Attribution } from "@/lib/stocktake/attribution";

export type Row = {
  id: number;
  delta: number;
  bizType: string;
  docNo: string;
  ts: string | Date;
  operatorId: string;
  reviewerId: string | null;
  status: string;
  qc: boolean | null;
  scanned: boolean;
  pdAdjust: boolean;
};

export type SkuMeta = {
  skuCode: string;
  styleName: string;
  color: string;
  size: string;
  costPrice?: number | null;
  tagPrice: number;
  safetyStock: number;
};

export type ReconInfo = {
  book: number;
  actual: number;
  diff: number;
  attr: Attribution;
  resolved: boolean;
};
