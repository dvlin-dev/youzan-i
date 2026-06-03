"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { rejectDoc, reviewDoc, submitMove } from "@/lib/actions";
import { COLOR_HEX, SIZE_ORDER } from "@/lib/constants";

import { Icon } from "./icons";
import { useToast } from "./toast";

type SkuRow = {
  skuCode: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  qty: number;
};
type Pend = {
  doc: string;
  type: string;
  operator: string;
  n: number;
  sum: number;
};

export function MoveBoard({
  skus,
  pending,
}: {
  skus: SkuRow[];
  pending: Pend[];
}) {
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [style, setStyle] = useState(skus[0]?.styleNo ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const router = useRouter();
  const toast = useToast();

  const styles = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of skus) if (!m.has(s.styleNo)) m.set(s.styleNo, s.styleName);
    return [...m.entries()];
  }, [skus]);
  const cur = skus.filter((s) => s.styleNo === style);
  const colors = [...new Set(cur.map((s) => s.color))];
  const sizes = [...new Set(cur.map((s) => s.size))].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
  );
  const total = Object.values(qty).reduce((a, v) => a + (parseInt(v) || 0), 0);

  async function submit() {
    setErr("");
    const entries = Object.entries(qty)
      .map(([k, v]) => ({ skuCode: k, qty: parseInt(v) || 0 }))
      .filter((e) => e.qty > 0);
    if (!entries.length) return setErr("请至少录入一个数量");
    const r = await submitMove({ type, entries });
    if (!r.ok) return setErr(r.msg);
    toast(r.msg);
    setQty({});
    router.refresh();
  }
  async function review(doc: string) {
    const r = await reviewDoc(doc);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }
  async function reject(doc: string) {
    const r = await rejectDoc(doc);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: 18,
        alignItems: "start",
      }}
    >
      <div className="card pad">
        <div className="row" style={{ marginBottom: 18 }}>
          <div
            className="roles"
            style={{ background: "var(--surface-2)", width: 180 }}
          >
            <button
              className="role-btn"
              style={
                type === "IN"
                  ? { background: "var(--surface)", color: "var(--ink)" }
                  : {}
              }
              onClick={() => setType("IN")}
            >
              入库
            </button>
            <button
              className="role-btn"
              style={
                type === "OUT"
                  ? { background: "var(--surface)", color: "var(--ink)" }
                  : {}
              }
              onClick={() => setType("OUT")}
            >
              出库
            </button>
          </div>
          <select
            className="input"
            style={{ maxWidth: 300, marginLeft: 6 }}
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          >
            {styles.map(([no, name]) => (
              <option key={no} value={no}>
                {name} · {no}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            按 颜色 × 尺码 矩阵录入数量{" "}
            <span className="dim" style={{ fontWeight: 400 }}>
              像 Excel 一样快
            </span>
          </label>
          <div style={{ overflowX: "auto" }}>
            <table className="matrix" style={{ borderSpacing: "8px 6px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>颜色 \ 尺码</th>
                  {sizes.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => (
                  <tr key={c}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 11,
                          height: 11,
                          borderRadius: 3,
                          background: COLOR_HEX[c] ?? "#ccc",
                          verticalAlign: -1,
                          marginRight: 7,
                        }}
                      />
                      {c}
                    </td>
                    {sizes.map((sz) => {
                      const s = cur.find((x) => x.color === c && x.size === sz);
                      if (!s)
                        return (
                          <td
                            key={sz}
                            style={{ textAlign: "center" }}
                            className="dim"
                          >
                            —
                          </td>
                        );
                      return (
                        <td key={sz} style={{ textAlign: "center" }}>
                          <input
                            className="qty-in"
                            inputMode="numeric"
                            value={qty[s.skuCode] ?? ""}
                            placeholder="0"
                            onChange={(e) =>
                              setQty((q) => ({
                                ...q,
                                [s.skuCode]: e.target.value,
                              }))
                            }
                          />
                          <div
                            className="dim"
                            style={{ fontSize: 10.5, marginTop: 2 }}
                          >
                            现 {s.qty}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {err && <div className="field-err">{err}</div>}
        </div>
        <div
          className="between"
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 14,
            marginTop: 4,
          }}
        >
          <div>
            合计{" "}
            <b className="tnum" style={{ fontSize: 18, color: "var(--ink)" }}>
              {total}
            </b>{" "}
            件 ·{" "}
            <span className="dim">
              {type === "IN" ? "入库增加" : "出库减少"}库存
            </span>
          </div>
          <button className="btn primary" onClick={submit}>
            <Icon name="check" size={15} /> 提交（进入待复核）
          </button>
        </div>
      </div>

      <div className="card pad">
        <h2 className="sec">
          待复核{" "}
          {pending.length > 0 && (
            <span className="pill warn" style={{ marginLeft: 6 }}>
              <span className="dot" />
              {pending.length}
            </span>
          )}
        </h2>
        <div
          className="dim"
          style={{
            fontSize: 12,
            margin: "-4px 0 12px",
            display: "flex",
            gap: 6,
          }}
        >
          <Icon name="shield" size={13} />
          <span>
            改变库存的动作先进<b>待复核</b>、<b>审批</b>
            后才入账（任何人可审批，含录入人本人）；入账有守恒护栏不让库存为负——这正是治&ldquo;盘点差三万&rdquo;的根因。
          </span>
        </div>
        {pending.length === 0 && (
          <div className="empty" style={{ padding: "30px 10px" }}>
            <div className="e-ic">
              <Icon name="check" size={26} />
            </div>
            <h3>暂无待复核单据</h3>
          </div>
        )}
        {pending.map((p) => (
          <div
            className="alert-row"
            key={p.doc}
            style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
          >
            <div className="between">
              <span className={"pill " + (p.type === "入库" ? "info" : "teal")}>
                <span className="dot" />
                {p.type} · {p.n} SKU · {p.sum}件
              </span>
              <span className="ld-doc">{p.doc}</span>
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              录入：{p.operator}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary sm" onClick={() => review(p.doc)}>
                <Icon name="check" size={13} /> 审批通过
              </button>
              <button className="btn sm" onClick={() => reject(p.doc)}>
                驳回
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
