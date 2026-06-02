"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { yuan } from "@/lib/money";
import { receivePO } from "@/lib/actions";

type Line = { skuCode: string; ordered: number; received: number; price: number };
type Po = { poNo: string; supplier: string; status: string; eta: string | null; lines: Line[] };
const FLOW = ["草稿", "已下单", "部分到货", "已入库"];
const pillClass = (s: string) => (s === "已入库" ? "ok" : s === "草稿" ? "neutral" : s === "部分到货" ? "warn" : "info");

export function PoBoard({ pos, canCost }: { pos: Po[]; canCost: boolean }) {
  const [sel, setSel] = useState<Po | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function receive(poNo: string) {
    const r = await receivePO(poNo);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) {
      setSel(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="toolbar">
        <div className="dim">共 {pos.length} 张采购单</div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>采购单号</th>
              <th>供应商</th>
              <th>状态</th>
              <th className="num">到货进度</th>
              {canCost && <th className="num">金额</th>}
              <th>预计到货</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => {
              const ord = p.lines.reduce((a, l) => a + l.ordered, 0);
              const rec = p.lines.reduce((a, l) => a + l.received, 0);
              const amt = p.lines.reduce((a, l) => a + l.ordered * l.price, 0);
              const pct = ord ? Math.round((rec / ord) * 100) : 0;
              return (
                <tr key={p.poNo} className="clickable" onClick={() => setSel(p)}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{p.poNo}</td>
                  <td>{p.supplier}</td>
                  <td>
                    <span className={"pill " + pillClass(p.status)}>
                      <span className="dot" />
                      {p.status}
                    </span>
                  </td>
                  <td className="num">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <div style={{ width: 70, height: 6, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: pct === 100 ? "var(--success)" : "var(--primary-600)" }} />
                      </div>
                      <span className="tnum dim" style={{ fontSize: 12 }}>{rec}/{ord}</span>
                    </div>
                  </td>
                  {canCost && <td className="num tnum">{yuan(amt)}</td>}
                  <td className="dim">{p.eta ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sel && <PoDrawer po={sel} canCost={canCost} onClose={() => setSel(null)} onReceive={receive} />}
    </>
  );
}

function PoDrawer({ po, canCost, onClose, onReceive }: { po: Po; canCost: boolean; onClose: () => void; onReceive: (poNo: string) => void }) {
  const idx = FLOW.indexOf(po.status === "已取消" ? "草稿" : po.status);
  const ord = po.lines.reduce((a, l) => a + l.ordered, 0);
  const rec = po.lines.reduce((a, l) => a + l.received, 0);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--mono)" }}>{po.poNo}</div>
            <div className="dim" style={{ fontSize: 12.5 }}>{po.supplier}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="timeline">
            {FLOW.map((s, i) => (
              <div className={"tl-step " + (i < idx ? "done" : i === idx ? "cur" : "")} key={s}>
                {i > 0 && <span className="tl-line" />}
                <span className="d">{i < idx ? "✓" : i + 1}</span>
                <span className="t">{s}</span>
              </div>
            ))}
          </div>
          <div className="card pad" style={{ marginTop: 18 }}>
            <div className="between">
              <span className="dim">到货进度</span>
              <b className="tnum">{rec} / {ord} 件</b>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden", marginTop: 8 }}>
              <div style={{ width: (ord ? Math.round((rec / ord) * 100) : 0) + "%", height: "100%", background: "var(--primary-600)" }} />
            </div>
          </div>
          <h2 className="sec" style={{ marginTop: 18 }}>采购明细</h2>
          <table className="tbl" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th className="num">订量</th>
                <th className="num">已到</th>
                {canCost && <th className="num">单价</th>}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.skuCode}>
                  <td>{l.skuCode}</td>
                  <td className="num tnum">{l.ordered}</td>
                  <td className="num tnum">{l.received}</td>
                  {canCost && <td className="num tnum">{yuan(l.price)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {["已下单", "部分到货"].includes(po.status) && (
            <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={() => onReceive(po.poNo)}>
              <Icon name="in" size={15} /> 登记到货（生成入库单 · 待复核）
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
