"use client";
import { useMemo, useState } from "react";
import { Icon } from "./icons";
import { yuan } from "@/lib/money";
import { COLOR_HEX, SIZE_ORDER } from "@/lib/constants";
import { LedgerDrawer } from "./LedgerDrawer";

export type SkuRow = {
  skuCode: string;
  styleNo: string;
  styleName: string;
  category: string;
  color: string;
  size: string;
  costPrice: number;
  tagPrice: number;
  safetyStock: number;
  qty: number;
  level: "ok" | "warn" | "danger";
};

const TINT = ["#0E6E63", "#A86E14", "#9C5A2A", "#3F6E4A", "#3A5A78", "#8C3A4A", "#4A6E2E", "#B23F2C"];

export function StockBrowser({ skus, canCost }: { skus: SkuRow[]; canCost: boolean }) {
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<string | null>(null);

  const styles = useMemo(() => {
    const m = new Map<
      string,
      { styleNo: string; styleName: string; category: string; costPrice: number; tagPrice: number; tint: string; colors: string[]; sizes: string[]; items: SkuRow[] }
    >();
    for (const s of skus) {
      let g = m.get(s.styleNo);
      if (!g) {
        g = { styleNo: s.styleNo, styleName: s.styleName, category: s.category, costPrice: s.costPrice, tagPrice: s.tagPrice, tint: TINT[m.size % TINT.length], colors: [], sizes: [], items: [] };
        m.set(s.styleNo, g);
      }
      g.items.push(s);
      if (!g.colors.includes(s.color)) g.colors.push(s.color);
      if (!g.sizes.includes(s.size)) g.sizes.push(s.size);
    }
    return [...m.values()].map((g) => ({ ...g, sizes: g.sizes.sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)) }));
  }, [skus]);

  const ql = q.trim().toLowerCase();
  let list = styles.filter(
    (g) => !ql || (g.styleNo + g.styleName + g.category).toLowerCase().includes(ql) || g.items.some((s) => s.skuCode.toLowerCase().includes(ql)),
  );
  if (lowOnly) list = list.filter((g) => g.items.some((s) => s.level !== "ok"));

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input placeholder="搜索款号 / 品名 / 条码…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="row" style={{ cursor: "pointer", fontSize: 13, color: "var(--text-2)", gap: 6 }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> 只看低库存
        </label>
        <div style={{ marginLeft: "auto" }} className="dim">
          共 {skus.length} 个 SKU · {styles.length} 款
        </div>
      </div>

      {list.length === 0 && (
        <div className="empty">
          <div className="e-ic"><Icon name="search" size={26} /></div>
          <h3>没有匹配的款号</h3>
        </div>
      )}

      {list.map((g) => {
        const total = g.items.reduce((a, s) => a + s.qty, 0);
        const lowN = g.items.filter((s) => s.level !== "ok").length;
        const isOpen = open[g.styleNo];
        return (
          <div className="style-group" key={g.styleNo}>
            <div className="sg-head" onClick={() => setOpen((o) => ({ ...o, [g.styleNo]: !o[g.styleNo] }))}>
              <span style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: ".2s", color: "var(--text-3)", display: "inline-flex" }}>
                <Icon name="chev" size={16} />
              </span>
              <span className="sg-thumb" style={{ background: g.tint }}>{g.category.slice(0, 2)}</span>
              <div>
                <div className="sg-title">{g.styleName}</div>
                <div className="sg-meta">
                  {g.styleNo} · {g.colors.length}色 × {g.sizes.length}码{canCost ? ` · 成本 ${yuan(g.costPrice)}` : ""} · 吊牌 {yuan(g.tagPrice)}
                </div>
              </div>
              <div className="sg-stat">
                {lowN ? (
                  <span className="pill warn"><span className="dot" />{lowN} 个待补</span>
                ) : (
                  <span className="pill ok"><span className="dot" />充足</span>
                )}
                <div>
                  <div className="n tnum">{total}</div>
                  <div className="k">总库存(件)</div>
                </div>
              </div>
            </div>
            {isOpen && (
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>颜色 \ 尺码</th>
                      {g.sizes.map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                      <th>小计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.colors.map((c) => {
                      const rowsum = g.items.filter((s) => s.color === c).reduce((a, s) => a + s.qty, 0);
                      return (
                        <tr key={c}>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: COLOR_HEX[c] ?? "#ccc", verticalAlign: -1, marginRight: 7 }} />
                            {c}
                          </td>
                          {g.sizes.map((sz) => {
                            const s = g.items.find((x) => x.color === c && x.size === sz);
                            if (!s)
                              return (
                                <td key={sz}>
                                  <div className="cell empty"><span className="z">—</span></div>
                                </td>
                              );
                            return (
                              <td key={sz}>
                                <div className={"cell lvl-" + s.level} onClick={() => setDrawer(s.skuCode)}>
                                  <span className="q tnum">{s.qty}</span>
                                  <span className="z">{sz}</span>
                                </div>
                              </td>
                            );
                          })}
                          <td className="num tnum" style={{ fontWeight: 700 }}>{rowsum}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
                  点任意格子查看该 SKU 的<b>不可变流水</b>（可追溯）
                </div>
              </div>
            )}
          </div>
        );
      })}

      {drawer && <LedgerDrawer skuCode={drawer} canCost={canCost} onClose={() => setDrawer(null)} />}
    </>
  );
}
