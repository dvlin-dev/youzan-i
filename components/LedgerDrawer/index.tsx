"use client";
import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { explainDiff, fetchLedger } from "@/lib/actions";
import { runningBalances, sumDeltas } from "@/lib/stock-math";

import { LedgerList } from "./components/LedgerList";
import { ReconAttribution } from "./components/ReconAttribution";
import { StatCards } from "./components/StatCards";
import type { Row, SkuMeta } from "./types";
import type { ReconInfo } from "./types";

export type { ReconInfo } from "./types";

export function LedgerDrawer({
  skuCode,
  canCost,
  recon,
  onClose,
  onAdopt,
}: {
  skuCode: string;
  canCost: boolean;
  recon?: ReconInfo;
  onClose: () => void;
  onAdopt?: (skuCode: string) => void;
}) {
  const [data, setData] = useState<{ sku: SkuMeta | null; rows: Row[] } | null>(
    null,
  );
  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  useEffect(() => {
    fetchLedger(skuCode).then((d) =>
      setData(d as { sku: SkuMeta | null; rows: Row[] }),
    );
  }, [skuCode]);

  const sku = data?.sku;
  const posted = (data?.rows ?? []).filter((r) => r.status === "posted");
  const cur = sumDeltas(posted);
  // 结存 = 流水逐笔累加（纯函数，无可变外部状态）
  const items = runningBalances(posted);

  async function runExplain() {
    setExplaining(true);
    const r = await explainDiff(skuCode);
    setExplain(r.text);
    setExplaining(false);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer wide">
        <div className="drawer-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
              {sku?.styleName ?? "…"}
            </div>
            <div className="dim" style={{ fontSize: 12.5 }}>
              {sku ? `${sku.color} / ${sku.size} · ` : ""}
              <span style={{ fontFamily: "var(--mono)" }}>{skuCode}</span>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
            aria-label="关闭"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <StatCards recon={recon} cur={cur} sku={sku} canCost={canCost} />
          {recon && (
            <ReconAttribution
              attr={recon.attr}
              resolved={recon.resolved}
              skuCode={skuCode}
              onAdopt={onAdopt}
              explain={explain}
              explaining={explaining}
              onExplain={runExplain}
            />
          )}
          <LedgerList items={items} loading={!data} />
        </div>
      </aside>
    </>
  );
}
