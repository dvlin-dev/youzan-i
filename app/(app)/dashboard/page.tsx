import Link from "next/link";
import { allSkus, stockMap, levelOf, recentLedger, pendingDocs } from "@/lib/db/queries";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/constants";
import { yuan } from "@/lib/money";
import { Icon } from "@/components/icons";

export default async function DashboardPage() {
  const user = (await currentUser())!;
  const [skus, sm, recent, pend] = await Promise.all([
    allSkus(),
    stockMap(),
    recentLedger(7),
    pendingDocs(),
  ]);
  const skuMap = new Map(skus.map((s) => [s.skuCode, s]));
  const low = skus.filter((s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) !== "ok");
  const dangerN = low.filter((s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) === "danger").length;
  const totalUnits = Object.values(sm).reduce((a, b) => a + b, 0);
  const pendCount = Object.keys(pend).length;
  const styleCount = new Set(skus.map((s) => s.styleNo)).size;

  let reconCard: { lbl: string; val: string; tone: string; sub: string };
  if (can.recon(user.role)) {
    const v = await loadStocktakeView();
    if (v && v.stocktake.status !== "已过账") {
      const s = summarize(v.rows);
      reconCard = { lbl: "待处理盘点差异", val: yuan(s.loss), tone: "var(--danger-2)", sub: `AI 归因·真损失约 ${yuan(s.real)}` };
    } else {
      reconCard = { lbl: "本月盘点", val: "已平", tone: "var(--success)", sub: "差异已过账归零" };
    }
  } else {
    reconCard = { lbl: "待复核单据", val: String(pendCount), tone: "var(--text-2)", sub: "审批后才入账" };
  }

  const kpis = [
    { lbl: "在库总件数", val: totalUnits.toLocaleString("zh-CN"), unit: "件", icon: "box", tone: "var(--primary-600)", bg: "var(--primary-weak)", sub: `${skus.length} 个 SKU` },
    { lbl: "低库存 SKU", val: String(low.length), unit: "个", icon: "alert", tone: "var(--warn)", bg: "var(--warn-weak)", sub: `含 ${dangerN} 个断码` },
    { lbl: reconCard.lbl, val: reconCard.val, unit: "", icon: "scale", tone: reconCard.tone, bg: "var(--danger-weak)", sub: reconCard.sub },
    can.recon(user.role)
      ? { lbl: "待复核单据", val: String(pendCount), unit: "单", icon: "clock", tone: "var(--text-2)", bg: "var(--surface-2)", sub: "审批后才入账" }
      : { lbl: "在售款数", val: String(styleCount), unit: "款", icon: "box", tone: "var(--teal)", bg: "var(--teal-weak)", sub: `${skus.length} 个 SKU` },
  ];

  return (
    <>
      <div className="banner">
        <Icon name="spark" />
        <div>
          <b>云链进销存</b> · 库存由<b>不可变流水</b>实时累加，账实差异经 AI 两层归因。右上角「AI 助手」可用一句话出入库 / 对账。
        </div>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.lbl}>
            <div className="top">
              <span className="lbl">{k.lbl}</span>
              <span className="ic" style={{ background: k.bg, color: k.tone }}>
                <Icon name={k.icon} size={16} />
              </span>
            </div>
            <div className="val tnum">
              {k.val}
              {k.unit && <small> {k.unit}</small>}
            </div>
            <div className="delta dim">{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="between pad" style={{ paddingBottom: 8 }}>
            <h2 className="sec" style={{ margin: 0 }}>库存预警 · 该补货了</h2>
            <Link href="/stock" className="btn sm ghost">
              查看全部 <Icon name="chev" size={14} />
            </Link>
          </div>
          <div className="pad" style={{ paddingTop: 6 }}>
            {low.length === 0 && (
              <div className="empty ok">
                <div className="e-ic"><Icon name="check" size={26} /></div>
                <h3>库存健康，暂无预警</h3>
              </div>
            )}
            {low.slice(0, 6).map((s) => {
              const q = sm[s.skuCode] ?? 0;
              const lv = levelOf(q, s.safetyStock);
              return (
                <Link href="/stock" key={s.skuCode} className="alert-row clickable" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className={"pill " + (lv === "danger" ? "danger" : "warn")}>
                    <span className="dot" />
                    {lv === "danger" ? "断码" : "偏低"}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {s.styleName} <span className="dim">/ {s.color} / {s.size}</span>
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>{s.styleNo} · 安全库存 {s.safetyStock}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div className="tnum" style={{ fontWeight: 700, fontSize: 16, color: lv === "danger" ? "var(--danger-2)" : "var(--warn)" }}>{q}</div>
                    <div className="dim" style={{ fontSize: 12 }}>当前库存</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card pad">
          <h2 className="sec">最近流水</h2>
          <div style={{ marginTop: 4 }}>
            {recent.map((l) => {
              const meta = skuMap.get(l.skuCode);
              return (
                <div className="ledger-item" key={l.id}>
                  <span className="ld-dot" style={{ background: l.delta > 0 ? "var(--success)" : "var(--primary-600)" }} />
                  <div className="ld-top">
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{l.delta > 0 ? "入库" : "出库"} {Math.abs(l.delta)} 件</span>
                    <span className="tnum bal" style={{ color: l.delta > 0 ? "var(--success)" : "var(--primary-600)" }}>
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                  </div>
                  <div className="ld-meta">
                    {meta?.styleName} {l.skuCode.split("-").slice(2).join("/")} · {l.bizType}
                  </div>
                  <div className="ld-doc">{l.docNo}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
