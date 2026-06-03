import { Icon } from "@/components/icons";
import { can } from "@/lib/constants";
import {
  allSkus,
  levelOf,
  pendingDocs,
  recentLedger,
  stockMap,
} from "@/lib/db/queries";
import { yuan } from "@/lib/money";
import { currentUser } from "@/lib/session";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";

import { KpiGrid } from "./components/KpiGrid";
import { LowStockCard } from "./components/LowStockCard";
import { RecentLedgerCard } from "./components/RecentLedgerCard";
import { type ReconCard, buildDashboardKpis } from "./dashboard-kpis";

export default async function DashboardPage() {
  const user = (await currentUser())!;
  const [skus, sm, recent, pend] = await Promise.all([
    allSkus(),
    stockMap(),
    recentLedger(7),
    pendingDocs(),
  ]);
  const skuMap = new Map(skus.map((s) => [s.skuCode, s]));
  const low = skus.filter(
    (s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) !== "ok",
  );
  const dangerN = low.filter(
    (s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) === "danger",
  ).length;
  const totalUnits = Object.values(sm).reduce((a, b) => a + b, 0);
  const pendCount = Object.keys(pend).length;
  const styleCount = new Set(skus.map((s) => s.styleNo)).size;

  let reconCard: ReconCard;
  if (can.recon(user.role)) {
    const v = await loadStocktakeView();
    if (v && v.stocktake.status !== "已过账") {
      const s = summarize(v.rows);
      reconCard = {
        lbl: "待处理盘点差异",
        val: yuan(s.loss),
        tone: "var(--danger-2)",
        sub: `AI 归因·真损失约 ${yuan(s.real)}`,
      };
    } else {
      reconCard = {
        lbl: "本月盘点",
        val: "已平",
        tone: "var(--success)",
        sub: "差异已过账归零",
      };
    }
  } else {
    reconCard = {
      lbl: "待复核单据",
      val: String(pendCount),
      tone: "var(--text-2)",
      sub: "审批后才入账",
    };
  }

  const kpis = buildDashboardKpis({
    role: user.role,
    totalUnits,
    skuCount: skus.length,
    lowCount: low.length,
    dangerN,
    pendCount,
    styleCount,
    reconCard,
  });

  return (
    <>
      <div className="banner">
        <Icon name="spark" />
        <div>
          <b>云链进销存</b> · 库存由<b>不可变流水</b>实时累加，账实差异经 AI
          两层归因。右上角「AI 助手」可用一句话出入库 / 对账。
        </div>
      </div>

      <KpiGrid kpis={kpis} />

      <div
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}
      >
        <LowStockCard low={low} sm={sm} />

        <RecentLedgerCard recent={recent} skuMap={skuMap} />
      </div>
    </>
  );
}
