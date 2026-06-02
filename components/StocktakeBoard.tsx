"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { yuan } from "@/lib/money";
import { LedgerDrawer } from "./LedgerDrawer";
import { adoptStocktakeRow, postAllStocktake, resetDemo } from "@/lib/actions";
import type { Attribution, Bucket } from "@/lib/stocktake/attribution";

type Row = {
  skuCode: string;
  styleName: string;
  styleNo: string;
  color: string;
  size: string;
  book: number;
  actual: number;
  diff: number;
  val: number;
  resolved: boolean;
  attr: Attribution;
};
type Summary = { loss: number; real: number; recover: number; buckets: Partial<Record<Bucket, { n: number; val: number }>> };

const BUCKETS: [Bucket, string, string][] = [
  ["swap", "串色·货在", "info"],
  ["dup", "重复记账·账面虚高", "warn"],
  ["supplier", "供应商少发·可索赔", "warn"],
  ["misship", "疑错发·待核实", "warn"],
  ["transit", "在途·假差异", "teal"],
  ["loss", "实物损耗·真损失", "danger"],
];

export function StocktakeBoard(props: {
  pdNo: string;
  status: string;
  scope: string;
  counter: string;
  snapTs: string;
  countedAt: string;
  rows: Row[];
  summary: Summary;
  canPost: boolean;
  canCost: boolean;
}) {
  const { pdNo, status, scope, counter, snapTs, countedAt, rows, summary, canPost } = props;
  const [sel, setSel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const posted = status === "已过账";
  const open = rows.filter((r) => !r.resolved);

  async function adopt(skuCode: string) {
    setBusy(true);
    const r = await adoptStocktakeRow(skuCode);
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) {
      setSel(null);
      router.refresh();
    }
  }
  async function postAll() {
    setBusy(true);
    const r = await postAllStocktake();
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) router.refresh();
  }
  async function reset() {
    setBusy(true);
    const r = await resetDemo();
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) router.refresh();
  }

  const fmt = (t: string) => new Date(t).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
  const steps = ["发起盘点", "盲盘录入实盘", "算差异 + AI 归因", "复核过账"];
  const active = posted ? 4 : 2;

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <b style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{pdNo}</b>
              <span className={"pill " + (posted ? "ok" : "warn")}>
                <span className="dot" />
                {status}
              </span>
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              {scope} · 账面快照 {fmt(snapTs)} · 实盘录入 {counter} @ {fmt(countedAt)}
            </div>
          </div>
          {canPost &&
            (posted ? (
              <button className="btn sm" onClick={reset} disabled={busy}>
                <Icon name="clock" size={14} /> 重置演示数据
              </button>
            ) : (
              <button className="btn primary sm" onClick={postAll} disabled={busy || open.length === 0}>
                <Icon name="check" size={14} /> 全部过账（记差异流水 · 双人复核）
              </button>
            ))}
        </div>
        <div className="timeline" style={{ maxWidth: 600 }}>
          {steps.map((s, i) => (
            <div className={"tl-step " + (i < active ? "done" : i === active ? "cur" : "")} key={s}>
              {i > 0 && <span className="tl-line" />}
              <span className="d">{i < active ? "✓" : i + 1}</span>
              <span className="t">{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-strip">
        <div className="ss">
          <div className="k">盘亏毛额（账面看着差这么多）</div>
          <div className="v neg tnum">{yuan(summary.loss)}</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>≈ 客户说的&ldquo;差了三万多&rdquo;</div>
        </div>
        <div className="ss">
          <div className="k">AI 归因后 · 真实物净损失</div>
          <div className="v tnum" style={{ color: "var(--danger-2)" }}>{yuan(summary.real)}</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>失窃 / 损耗 / 报损，该认</div>
        </div>
        <div className="ss">
          <div className="k">可追回（索赔 / 客户）</div>
          <div className="v tnum" style={{ color: "var(--warn)" }}>{yuan(summary.recover)}</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>供应商少发 + 疑错发</div>
        </div>
        <div className="ss">
          <div className="k">账目自洽性</div>
          <div className="v" style={{ color: "var(--success)", fontSize: 18 }}>I2 成立</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>库存 = 流水累加，差在账实侧</div>
        </div>
      </div>

      <div className="card" style={{ background: "linear-gradient(100deg,#EAF1ED,#F3EEDF)", borderColor: "#D8E1D2", marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, padding: "13px 16px", alignItems: "flex-start" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", color: "var(--primary-600)", display: "grid", placeItems: "center", flex: "none" }}>
            <Icon name="spark" size={18} />
          </span>
          <div>
            <b>AI 把&ldquo;差三万&rdquo;拆成了可执行的几摞：</b>
            <div style={{ marginTop: 7 }}>
              {BUCKETS.map(([b, label, tone]) => {
                const v = summary.buckets[b];
                if (!v) return null;
                return (
                  <span className={"pill " + tone} key={b} style={{ margin: "2px 6px 2px 0" }}>
                    <span className="dot" />
                    {label} {yuan(v.val)} · {v.n}项
                  </span>
                );
              })}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 7 }}>
              点任意行看<b>该 SKU 的流水链 + AI 归因证据 + 修复建议</b>；确认后过账，差异即归零。
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="between pad" style={{ paddingBottom: 10 }}>
          <h2 className="sec" style={{ margin: 0 }}>差异明细 · {open.length} 项待处理（按金额倒序）</h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU（款 × 色 × 码）</th>
              <th className="num">账面快照</th>
              <th className="num">实盘</th>
              <th className="num">差异</th>
              <th className="num">差异金额</th>
              <th>AI 归因</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.skuCode} className="clickable" onClick={() => setSel(r)} style={r.resolved ? { opacity: 0.55 } : undefined}>
                <td>
                  <b>{r.styleName}</b> <span className="dim">/ {r.color} / {r.size}</span>
                  <div className="ld-doc">{r.styleNo}</div>
                </td>
                <td className="num tnum">{r.book}</td>
                <td className="num tnum">{r.actual}</td>
                <td className="num tnum" style={{ color: r.diff < 0 ? "var(--danger-2)" : "var(--success)", fontWeight: 700 }}>
                  {r.diff > 0 ? "+" : ""}
                  {r.diff}
                </td>
                <td className="num tnum" style={{ color: r.val < 0 ? "var(--danger-2)" : "var(--success)", fontWeight: 700 }}>{yuan(r.val)}</td>
                <td>
                  <span className={"pill " + r.attr.tone}>
                    <span className="dot" />
                    {r.resolved ? "✓ 已处理" : r.attr.badge}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <LedgerDrawer
          skuCode={sel.skuCode}
          canCost={props.canCost}
          recon={{ book: sel.book, actual: sel.actual, diff: sel.diff, attr: sel.attr, resolved: sel.resolved }}
          onClose={() => setSel(null)}
          onAdopt={canPost && !sel.resolved ? adopt : undefined}
        />
      )}
    </>
  );
}
