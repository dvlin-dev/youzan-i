import { LockView } from "@/components/LockView";
import { StartStocktake } from "@/components/StartStocktake";
import { StocktakeBoard } from "@/components/StocktakeBoard";
import { can } from "@/lib/constants";
import { userNames } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";
import {
  loadStocktakeCounts,
  loadStocktakeView,
  summarize,
} from "@/lib/stocktake/engine";

export default async function StocktakePage() {
  const user = (await currentUser())!;
  if (!can.recon(user.role)) return <LockView name="盘点对账" />;
  const view = await loadStocktakeView();
  if (!view)
    return (
      <div className="empty" style={{ padding: "50px 20px" }}>
        <h3>暂无盘点单</h3>
        <p className="dim" style={{ marginTop: 4 }}>
          发起一次盘点：账面按当前库存快照，逐 SKU 录实盘后自动算差异并 AI
          归因。
        </p>
        <StartStocktake />
      </div>
    );
  const [countsData, names] = await Promise.all([
    loadStocktakeCounts(),
    userNames(),
  ]);
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
      counter={names[view.stocktake.counter] ?? view.stocktake.counter}
      snapTs={view.stocktake.snapTs.toISOString()}
      countedAt={view.stocktake.countedAt.toISOString()}
      rows={rows}
      summary={s}
      counts={countsData?.rows ?? []}
      canPost={can.postStocktake(user.role)}
      canManage={can.recon(user.role)}
      canCost={can.cost(user.role)}
    />
  );
}
