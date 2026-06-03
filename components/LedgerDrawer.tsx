"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { yuan } from "@/lib/money";
import { fetchLedger, explainDiff } from "@/lib/actions";
import { sumDeltas, runningBalances } from "@/lib/stock-math";
import type { Attribution } from "@/lib/stocktake/attribution";

type Row = {
  id: number;
  delta: number;
  bizType: string;
  docNo: string;
  ts: string | Date;
  operatorId: string;
  reviewerId: string | null;
  status: string;
  qc: boolean | null;
  scanned: boolean;
  pdAdjust: boolean;
};
type SkuMeta = { skuCode: string; styleName: string; color: string; size: string; costPrice?: number | null; tagPrice: number; safetyStock: number };
export type ReconInfo = { book: number; actual: number; diff: number; attr: Attribution; resolved: boolean };

function Card({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="card" style={{ flex: 1, textAlign: "center", padding: 12 }}>
      <div className="dim" style={{ fontSize: 12 }}>{k}</div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color }}>{v}</div>
    </div>
  );
}

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
  const [data, setData] = useState<{ sku: SkuMeta | null; rows: Row[] } | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  useEffect(() => {
    fetchLedger(skuCode).then((d) => setData(d as { sku: SkuMeta | null; rows: Row[] }));
  }, [skuCode]);

  const fmt = (t: string | Date) => new Date(t).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
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
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{sku?.styleName ?? "…"}</div>
            <div className="dim" style={{ fontSize: 12.5 }}>
              {sku ? `${sku.color} / ${sku.size} · ` : ""}
              <span style={{ fontFamily: "var(--mono)" }}>{skuCode}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">
          {recon ? (
            <div className="row" style={{ gap: 10, marginBottom: 14 }}>
              <Card k="账面快照" v={String(recon.book)} />
              <Card k="实盘" v={String(recon.actual)} />
              <Card k="差异" v={(recon.diff > 0 ? "+" : "") + recon.diff} color={recon.diff < 0 ? "var(--danger-2)" : recon.diff > 0 ? "var(--success)" : undefined} />
            </div>
          ) : (
            <div className="row" style={{ gap: 10, marginBottom: 16 }}>
              <Card k="当前库存" v={String(cur)} />
              <Card k="安全库存" v={String(sku?.safetyStock ?? "—")} color={sku && cur < sku.safetyStock ? "var(--warn)" : undefined} />
              {canCost && sku && sku.costPrice != null && <Card k="成本 / 吊牌" v={`${yuan(sku.costPrice)} / ${yuan(sku.tagPrice)}`} />}
            </div>
          )}

          {recon && (
            <div className="attrib">
              <div className="ah">
                <Icon name="spark" size={16} /> AI 差异归因
                <span className={"pill " + recon.attr.tone}>
                  <span className="dot" />
                  {recon.attr.badge}
                </span>
                <span className="dim" style={{ fontWeight: 500, fontSize: 12 }}>置信度 {recon.attr.conf}</span>
              </div>
              <p>{recon.attr.reason}</p>
              <div className="ev">
                <div style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 5 }}>检测器命中的证据</div>
                {recon.attr.ev.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 2 }}>
                    <span style={{ color: "var(--success)", flex: "none" }}>
                      <Icon name="check" size={12} />
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{e}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 8 }}>
                <b>建议：</b>
                {recon.attr.sug}
              </p>

              <div style={{ marginTop: 10, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                {explain == null ? (
                  <button
                    className="btn sm ghost"
                    onClick={runExplain}
                    disabled={explaining}
                    style={{ width: "100%", justifyContent: "center" }}
                    aria-label="让 AI 对成因排序并深入解释"
                  >
                    <Icon name="spark" size={13} /> {explaining ? "AI 分析中…" : "让 AI 深度归因（第 2 层 · 排序假设）"}
                  </button>
                ) : (
                  <div className="ev" style={{ background: "var(--primary-weak)", borderColor: "var(--border)" }}>
                    <div style={{ fontWeight: 600, color: "var(--primary)", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="spark" size={13} /> AI 第 2 层解释（基于上方检测器证据）
                    </div>
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{explain}</p>
                  </div>
                )}
              </div>

              {recon.resolved ? (
                <div className="hitl" style={{ borderRadius: 8, marginTop: 10, borderTop: "none" }}>
                  <Icon name="check" size={13} /> 已采纳并生成调整流水
                </div>
              ) : onAdopt ? (
                <button className="btn primary sm" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} onClick={() => onAdopt(skuCode)}>
                  <Icon name="check" size={13} /> 采纳：{recon.attr.fixLabel}（需老板复核）
                </button>
              ) : null}
            </div>
          )}

          <h2 className="sec" style={{ marginTop: 18 }}>不可变流水 · 库存 = 流水累加</h2>
          <div style={{ marginTop: 8 }}>
            {!data && <div className="dim">加载中…</div>}
            {items.map(({ row: r, balance: run }) => (
              <div className="ledger-item" key={r.id}>
                <span
                  className="ld-dot"
                  style={{ background: r.pdAdjust ? "var(--warn)" : r.delta > 0 ? "var(--success)" : r.bizType === "期初" ? "var(--text-3)" : "var(--primary-600)" }}
                />
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
                <div className="ld-doc">{r.docNo} · {fmt(r.ts)}</div>
              </div>
            ))}
          </div>
          <div className="dim" style={{ fontSize: 12, marginTop: 8, padding: 10, background: "var(--surface-2)", borderRadius: 9, display: "flex", gap: 6 }}>
            <Icon name="shield" size={13} />
            <span>流水<b>只增不改不删</b>，纠错只能红冲——这是 Excel 永远做不到、却能复盘&ldquo;差在哪&rdquo;的物理基础。</span>
          </div>
        </div>
      </aside>
    </>
  );
}
