import { type SkuRow, StockBrowser } from "@/components/StockBrowser";
import { can } from "@/lib/constants";
import { allSkus, levelOf, stockMap } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";

export default async function StockPage() {
  const user = (await currentUser())!;
  const canCost = can.cost(user.role);
  const [skus, sm] = await Promise.all([allSkus(), stockMap()]);
  const rows: SkuRow[] = skus.map((s) => ({
    skuCode: s.skuCode,
    styleNo: s.styleNo,
    styleName: s.styleName,
    category: s.category,
    color: s.color,
    size: s.size,
    costPrice: canCost ? s.costPrice : 0, // 字段级脱敏：仓管看不到成本
    tagPrice: s.tagPrice,
    safetyStock: s.safetyStock,
    qty: sm[s.skuCode] ?? 0,
    level: levelOf(sm[s.skuCode] ?? 0, s.safetyStock),
  }));
  return <StockBrowser skus={rows} canCost={canCost} />;
}
