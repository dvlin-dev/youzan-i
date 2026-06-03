"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createPO } from "@/lib/actions";
import { COLOR_HEX, SIZE_ORDER } from "@/lib/constants";

import { Icon } from "./icons";
import { useToast } from "./toast";

export type PoSkuOpt = {
  skuCode: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  qty: number;
};

/** 新建采购单抽屉：供应商 + 预计到货 + 选款按 颜色×尺码 录订量（单价取成本价）。 */
export function CreatePoForm({
  skus,
  onClose,
}: {
  skus: PoSkuOpt[];
  onClose: () => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [eta, setEta] = useState("");
  const [style, setStyle] = useState(skus[0]?.styleNo ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
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
  const lines = Object.entries(qty)
    .map(([skuCode, v]) => ({ skuCode, ordered: parseInt(v) || 0 }))
    .filter((l) => l.ordered > 0);
  const totalQty = lines.reduce((a, l) => a + l.ordered, 0);

  async function submit() {
    if (!supplier.trim()) return toast("请填供应商", "err");
    if (!lines.length) return toast("请至少录入一个订量", "err");
    setBusy(true);
    const r = await createPO({
      supplier: supplier.trim(),
      eta: eta.trim(),
      lines,
    });
    setBusy(false);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) {
      router.refresh();
      onClose();
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
            新建采购单
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
          <div className="field">
            <label>供应商</label>
            <input
              className="input"
              value={supplier}
              placeholder="如 杭州绫致服饰"
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div className="field">
            <label>
              预计到货{" "}
              <span className="dim" style={{ fontWeight: 400 }}>
                选填
              </span>
            </label>
            <input
              className="input"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
            />
          </div>
          <div className="field">
            <label>选款 · 按 颜色 × 尺码 录订量（切换款可多款下一单）</label>
            <select
              className="input"
              style={{ maxWidth: 320 }}
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
          <div
            className="between"
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 14,
              marginTop: 10,
            }}
          >
            <div>
              合计{" "}
              <b className="tnum" style={{ fontSize: 18, color: "var(--ink)" }}>
                {totalQty}
              </b>{" "}
              件 · <span className="dim">单价取成本价</span>
            </div>
            <button className="btn primary" onClick={submit} disabled={busy}>
              <Icon name="check" size={15} />{" "}
              {busy ? "提交中…" : "新建（草稿）"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
