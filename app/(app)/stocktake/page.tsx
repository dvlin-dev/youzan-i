import { currentUser } from "@/lib/session";
import { can } from "@/lib/constants";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";
import { StocktakeBoard } from "@/components/StocktakeBoard";
import { LockView } from "@/components/LockView";

export default async function StocktakePage() {
  const user = (await currentUser())!;
  if (!can.recon(user.role)) return <LockView name="盘点对账" />;
  const view = await loadStocktakeView();
  if (!view)
    return (
      <div className="empty">
        <h3>暂无盘点单</h3>
      </div>
    );
  const s = summarize(view.rows);
  const rows = view.rows.map((r) => ({
    skuCode: r.skuCode,
    styleName: r.sku.styleName,
    styleNo: r.sku.styleNo,
    color: r.sku.color,
    size: r.sku.size,
    book: r.book,
    actual: r.actual,
    diff: r.diff,
    val: r.val,
    resolved: r.resolved,
    attr: r.attr,
  }));
  return (
    <StocktakeBoard
      pdNo={view.stocktake.pdNo}
      status={view.stocktake.status}
      scope={view.stocktake.scope}
      counter={view.stocktake.counter}
      snapTs={view.stocktake.snapTs.toISOString()}
      countedAt={view.stocktake.countedAt.toISOString()}
      rows={rows}
      summary={s}
      canPost={can.postStocktake(user.role)}
      canCost={can.cost(user.role)}
    />
  );
}
