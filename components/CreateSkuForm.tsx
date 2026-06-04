"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createSku } from "@/lib/actions";
import { COLOR_HEX, SIZE_ORDER } from "@/lib/constants";

import { Icon } from "./icons";
import { useToast } from "./toast";

const PALETTE = Object.keys(COLOR_HEX);

/** 把「颜色1，颜色2 颜色3」这类自由文本拆成去空数组（中英逗号 / 空白都当分隔）。 */
function splitTokens(s: string): string[] {
  return s
    .split(/[，,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 元（可带小数）→ 整数分；非法输入返回 NaN 由调用方拦。 */
function yuanToCents(s: string): number {
  const v = parseFloat(s);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}

/**
 * 建档抽屉：登记一个款的主数据 + 价格 + 安全库存，并按 颜色 × 尺码 批量生成 SKU。
 * 库存从 0 起（建档不造流水）——新款先以断码呈现，去入库 / 采购补货后累加。
 */
export function CreateSkuForm({
  existingStyleNos,
  categories,
  onClose,
}: {
  existingStyleNos: string[];
  categories: string[];
  onClose: () => void;
}) {
  const [styleNo, setStyleNo] = useState("");
  const [styleName, setStyleName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [tag, setTag] = useState("");
  const [safety, setSafety] = useState("25");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pickedSize, setPickedSize] = useState<Record<string, boolean>>({});
  const [customColors, setCustomColors] = useState("");
  const [customSizes, setCustomSizes] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const colors = useMemo(() => {
    const base = PALETTE.filter((c) => picked[c]);
    return [...new Set([...base, ...splitTokens(customColors)])];
  }, [picked, customColors]);
  const sizes = useMemo(() => {
    const base = SIZE_ORDER.filter((s) => pickedSize[s]);
    return [...new Set([...base, ...splitTokens(customSizes)])];
  }, [pickedSize, customSizes]);

  const count = colors.length * sizes.length;
  const styleExists = existingStyleNos.includes(styleNo.trim());

  async function submit() {
    if (!styleNo.trim() || !styleName.trim() || !category.trim())
      return toast("款号 / 品名 / 品类都要填", "err");
    if (!colors.length || !sizes.length)
      return toast("颜色和尺码都至少选一个", "err");
    const costC = yuanToCents(cost);
    const tagC = yuanToCents(tag);
    if (!(costC >= 0) || !(tagC >= 0))
      return toast("成本价 / 吊牌价要填有效金额（元）", "err");
    setBusy(true);
    const r = await createSku({
      styleNo: styleNo.trim(),
      styleName: styleName.trim(),
      category: category.trim(),
      costPrice: costC,
      tagPrice: tagC,
      safetyStock: parseInt(safety, 10) || 0,
      colors,
      sizes,
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
            建档 · 新增款
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
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label>款号</label>
              <input
                className="input"
                value={styleNo}
                placeholder="如 AW2024-8800"
                onChange={(e) => setStyleNo(e.target.value)}
              />
              {styleExists && (
                <div
                  className="dim"
                  style={{ fontSize: 11.5, marginTop: 4, color: "var(--warn)" }}
                >
                  该款号已存在 · 仅会追加新增的 色/码 组合
                </div>
              )}
            </div>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label>品名</label>
              <input
                className="input"
                value={styleName}
                placeholder="如 加绒高领针织衫"
                onChange={(e) => setStyleName(e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 140px" }}>
              <label>品类</label>
              <input
                className="input"
                value={category}
                placeholder="如 针织衫"
                list="sku-cats"
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="sku-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field" style={{ flex: "1 1 110px" }}>
              <label>成本价（元）</label>
              <input
                className="input"
                inputMode="decimal"
                value={cost}
                placeholder="120"
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: "1 1 110px" }}>
              <label>吊牌价（元）</label>
              <input
                className="input"
                inputMode="decimal"
                value={tag}
                placeholder="299"
                onChange={(e) => setTag(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: "1 1 110px" }}>
              <label>安全库存</label>
              <input
                className="input"
                inputMode="numeric"
                value={safety}
                onChange={(e) => setSafety(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>颜色（点选常用色，或在下方补自定义色）</label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  onClick={() => setPicked((p) => ({ ...p, [c]: !p[c] }))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    border: picked[c]
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: picked[c]
                      ? "var(--primary-weak)"
                      : "var(--surface)",
                    color: "var(--text)",
                    borderRadius: 999,
                    padding: "4px 11px",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      background: COLOR_HEX[c],
                    }}
                  />
                  {c}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ marginTop: 8 }}
              value={customColors}
              placeholder="自定义色，逗号或空格分隔，如 焦糖，雾霾蓝"
              onChange={(e) => setCustomColors(e.target.value)}
            />
          </div>

          <div className="field">
            <label>尺码</label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {SIZE_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  onClick={() => setPickedSize((p) => ({ ...p, [s]: !p[s] }))}
                  style={{
                    cursor: "pointer",
                    border: pickedSize[s]
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: pickedSize[s]
                      ? "var(--primary-weak)"
                      : "var(--surface)",
                    color: "var(--text)",
                    borderRadius: 999,
                    padding: "4px 13px",
                    fontSize: 13,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ marginTop: 8 }}
              value={customSizes}
              placeholder="自定义码，如 XS，3XL，均码"
              onChange={(e) => setCustomSizes(e.target.value)}
            />
          </div>

          <div
            className="between"
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 14,
              marginTop: 6,
            }}
          >
            <div>
              将生成{" "}
              <b className="tnum" style={{ fontSize: 18, color: "var(--ink)" }}>
                {count}
              </b>{" "}
              个 SKU ·{" "}
              <span className="dim">
                {colors.length} 色 × {sizes.length} 码，库存 0 起
              </span>
            </div>
            <button
              className="btn primary"
              onClick={submit}
              disabled={busy || count === 0}
            >
              <Icon name="check" size={15} /> {busy ? "建档中…" : "建档"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
