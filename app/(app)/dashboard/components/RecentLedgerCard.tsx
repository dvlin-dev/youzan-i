import type { Sku, StockLedger } from "@/lib/db/schema";

/** 最近流水卡：纯展示，流水与 SKU 元信息映射经 props 传入。 */
export function RecentLedgerCard({
  recent,
  skuMap,
}: {
  recent: StockLedger[];
  skuMap: Map<string, Sku>;
}) {
  return (
    <div className="card pad">
      <h2 className="sec">最近流水</h2>
      <div style={{ marginTop: 4 }}>
        {recent.map((l) => {
          const meta = skuMap.get(l.skuCode);
          const deltaColor =
            l.delta > 0 ? "var(--success)" : "var(--primary-600)";
          return (
            <div className="ledger-item" key={l.id}>
              <span className="ld-dot" style={{ background: deltaColor }} />
              <div className="ld-top">
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {l.delta > 0 ? "入库" : "出库"} {Math.abs(l.delta)} 件
                </span>
                <span className="tnum bal" style={{ color: deltaColor }}>
                  {l.delta > 0 ? "+" : ""}
                  {l.delta}
                </span>
              </div>
              <div className="ld-meta">
                {meta?.styleName} {l.skuCode.split("-").slice(2).join("/")} ·{" "}
                {l.bizType}
              </div>
              <div className="ld-doc">{l.docNo}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
