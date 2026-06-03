export type SkuRow = {
  skuCode: string;
  styleNo: string;
  styleName: string;
  category: string;
  color: string;
  size: string;
  costPrice: number;
  tagPrice: number;
  safetyStock: number;
  qty: number;
  level: "ok" | "warn" | "danger";
};

export type StyleGroup = {
  styleNo: string;
  styleName: string;
  category: string;
  costPrice: number;
  tagPrice: number;
  tint: string;
  colors: string[];
  sizes: string[];
  items: SkuRow[];
};
