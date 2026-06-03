import { db } from "@/lib/db/client";
import { activeStocktake, allSkus, ledgerOf } from "@/lib/db/queries";
import { type Sku, poLine } from "@/lib/db/schema";

import { type Attribution, type Bucket, attribute } from "./attribution";

export type DiffRow = {
  skuCode: string;
  sku: Sku;
  book: number;
  actual: number;
  diff: number;
  val: number; // 差异金额（分）
  resolved: boolean;
  attr: Attribution;
};

export type StocktakeView = {
  stocktake: NonNullable<Awaited<ReturnType<typeof activeStocktake>>>;
  rows: DiffRow[];
};

export async function loadStocktakeView(): Promise<StocktakeView | null> {
  const st = await activeStocktake();
  if (!st) return null;

  const skus = await allSkus();
  const skuMap = new Map(skus.map((s) => [s.skuCode, s]));
  const lines = await db.select().from(poLine);
  const poOrdered = (poRef: string, skuCode: string) =>
    lines.find((l) => l.poNo === poRef && l.skuCode === skuCode)?.ordered ??
    null;

  const siblings = st.counts
    .map((c) => {
      const s = skuMap.get(c.skuCode);
      if (!s) return null;
      return {
        skuCode: c.skuCode,
        styleNo: s.styleNo,
        color: s.color,
        size: s.size,
        diff: c.actual - c.bookSnapshot,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const rows: DiffRow[] = [];
  for (const c of st.counts) {
    const sku = skuMap.get(c.skuCode);
    if (!sku) continue;
    const diff = c.actual - c.bookSnapshot;
    if (diff === 0) continue;
    const ledger = await ledgerOf(c.skuCode);
    const attr = attribute({
      sku,
      diff,
      ledger,
      snapTs: st.snapTs,
      siblings,
      poOrdered,
    });
    rows.push({
      skuCode: c.skuCode,
      sku,
      book: c.bookSnapshot,
      actual: c.actual,
      diff,
      val: diff * sku.costPrice,
      resolved: c.resolved,
      attr,
    });
  }
  rows.sort((a, b) => a.val - b.val);
  return { stocktake: st, rows };
}

/** 故事汇总（对全部差异行，不论是否已处理，保证数字稳定）。 */
export function summarize(rows: DiffRow[]) {
  const loss = rows.filter((r) => r.val < 0).reduce((a, r) => a + r.val, 0);
  const real = rows.filter((r) => r.attr.real).reduce((a, r) => a + r.val, 0);
  const recover = rows
    .filter((r) => r.attr.recover)
    .reduce((a, r) => a + r.val, 0);
  const buckets: Partial<Record<Bucket, { n: number; val: number }>> = {};
  for (const r of rows) {
    const b = (buckets[r.attr.bucket] ??= { n: 0, val: 0 });
    b.n++;
    b.val += r.val;
  }
  return { loss, real, recover, buckets };
}

export type CountRow = {
  skuCode: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  book: number;
  actual: number;
};

/** 录实盘用：进行中盘点的**全部**计数行（含账面与当前实盘），不像 view 只给差异行。 */
export async function loadStocktakeCounts(): Promise<{
  pdNo: string;
  status: string;
  rows: CountRow[];
} | null> {
  const st = await activeStocktake();
  if (!st) return null;
  const skus = await allSkus();
  const skuMap = new Map(skus.map((s) => [s.skuCode, s]));
  const rows: CountRow[] = [];
  for (const c of st.counts) {
    const s = skuMap.get(c.skuCode);
    if (!s) continue;
    rows.push({
      skuCode: c.skuCode,
      styleNo: s.styleNo,
      styleName: s.styleName,
      color: s.color,
      size: s.size,
      book: c.bookSnapshot,
      actual: c.actual,
    });
  }
  rows.sort(
    (a, b) =>
      a.styleNo.localeCompare(b.styleNo) ||
      a.color.localeCompare(b.color) ||
      a.size.localeCompare(b.size),
  );
  return { pdNo: st.pdNo, status: st.status, rows };
}
