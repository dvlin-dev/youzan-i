import { Icon } from "@/components/icons";

import type { Row } from "../types";

// 流水圆点颜色：盘点调整 / 入库 / 期初 / 出库——抽成 helper，不在 JSX 里堆三元。
const dotColor = (r: Row) =>
  r.pdAdjust
    ? "var(--warn)"
    : r.delta > 0
      ? "var(--success)"
      : r.bizType === "期初"
        ? "var(--text-3)"
        : "var(--primary-600)";

const fmt = (t: string | Date) =>
  new Date(t).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");

/** 不可变流水列表（库存 = 流水累加），带逐笔结存。 */
export function LedgerList({
  items,
  loading,
}: {
  items: { row: Row; balance: number }[];
  loading: boolean;
}) {
  return (
    <>
      <h2 className="sec" style={{ marginTop: 18 }}>
        不可变流水 · 库存 = 流水累加
      </h2>
      <div style={{ marginTop: 8 }}>
        {loading && <div className="dim">加载中…</div>}
        {items.map(({ row: r, balance: run }) => (
          <div className="ledger-item" key={r.id}>
            <span className="ld-dot" style={{ background: dotColor(r) }} />
            <div className="ld-top">
              <span style={{ fontWeight: 600 }}>
                {r.bizType} {r.delta > 0 ? "+" : ""}
                {r.delta}
              </span>
              <span className="tnum">
                结存 <span className="bal">{run}</span>
              </span>
            </div>
            <div className="ld-meta">
              {r.operatorId} 录入
              {r.reviewerId ? ` · ${r.reviewerId} 复核` : ""}
              {r.qc === false ? " · ⚠ 未质检" : ""}
              {r.scanned === false && r.bizType === "采购到货" ? " · 手输" : ""}
            </div>
            <div className="ld-doc">
              {r.docNo} · {fmt(r.ts)}
            </div>
          </div>
        ))}
      </div>
      <div
        className="dim"
        style={{
          fontSize: 12,
          marginTop: 8,
          padding: 10,
          background: "var(--surface-2)",
          borderRadius: 9,
          display: "flex",
          gap: 6,
        }}
      >
        <Icon name="shield" size={13} />
        <span>
          流水<b>只增不改不删</b>，纠错只能红冲——这是 Excel
          永远做不到、却能复盘&ldquo;差在哪&rdquo;的物理基础。
        </span>
      </div>
    </>
  );
}
