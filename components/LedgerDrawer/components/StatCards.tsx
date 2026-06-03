import { yuan } from "@/lib/money";

import type { ReconInfo, SkuMeta } from "../types";

function Card({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="card" style={{ flex: 1, textAlign: "center", padding: 12 }}>
      <div className="dim" style={{ fontSize: 12 }}>
        {k}
      </div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color }}>
        {v}
      </div>
    </div>
  );
}

const diffColor = (diff: number) =>
  diff < 0 ? "var(--danger-2)" : diff > 0 ? "var(--success)" : undefined;

/** 顶部统计卡：盘点视图 vs 普通库存视图——两选一，早返回不堆三元。 */
export function StatCards({
  recon,
  cur,
  sku,
  canCost,
}: {
  recon?: ReconInfo;
  cur: number;
  sku?: SkuMeta | null;
  canCost: boolean;
}) {
  if (recon) {
    return (
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <Card k="账面快照" v={String(recon.book)} />
        <Card k="实盘" v={String(recon.actual)} />
        <Card
          k="差异"
          v={(recon.diff > 0 ? "+" : "") + recon.diff}
          color={diffColor(recon.diff)}
        />
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 10, marginBottom: 16 }}>
      <Card k="当前库存" v={String(cur)} />
      <Card
        k="安全库存"
        v={String(sku?.safetyStock ?? "—")}
        color={sku && cur < sku.safetyStock ? "var(--warn)" : undefined}
      />
      {canCost && sku && sku.costPrice != null && (
        <Card
          k="成本 / 吊牌"
          v={`${yuan(sku.costPrice)} / ${yuan(sku.tagPrice)}`}
        />
      )}
    </div>
  );
}
