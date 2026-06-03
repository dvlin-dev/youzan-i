import type { Dispatch, SetStateAction } from "react";

import { Icon } from "@/components/icons";

import type { SkuRow } from "../types";
import { MoveMatrix } from "./MoveMatrix";

const ACTIVE_BTN_STYLE = { background: "var(--surface)", color: "var(--ink)" };

/** 入/出库类型切换。当前项的高亮样式抽成常量，不在 JSX 里重复写对象字面量三元。 */
function TypeToggle({
  value,
  onChange,
}: {
  value: "IN" | "OUT";
  onChange: (t: "IN" | "OUT") => void;
}) {
  return (
    <div
      className="roles"
      style={{ background: "var(--surface-2)", width: 180 }}
    >
      <button
        className="role-btn"
        style={value === "IN" ? ACTIVE_BTN_STYLE : undefined}
        onClick={() => onChange("IN")}
      >
        入库
      </button>
      <button
        className="role-btn"
        style={value === "OUT" ? ACTIVE_BTN_STYLE : undefined}
        onClick={() => onChange("OUT")}
      >
        出库
      </button>
    </div>
  );
}

/** 录入卡：类型切换 + 选款 + 矩阵录入 + 合计/提交。 */
export function MoveEntryCard({
  type,
  onTypeChange,
  style,
  onStyleChange,
  styles,
  colors,
  sizes,
  cur,
  qty,
  onQtyChange,
  total,
  err,
  onSubmit,
}: {
  type: "IN" | "OUT";
  onTypeChange: (t: "IN" | "OUT") => void;
  style: string;
  onStyleChange: (no: string) => void;
  styles: [string, string][];
  colors: string[];
  sizes: string[];
  cur: SkuRow[];
  qty: Record<string, string>;
  onQtyChange: Dispatch<SetStateAction<Record<string, string>>>;
  total: number;
  err: string;
  onSubmit: () => void;
}) {
  return (
    <div className="card pad">
      <div className="row" style={{ marginBottom: 18 }}>
        <TypeToggle value={type} onChange={onTypeChange} />
        <select
          className="input"
          style={{ maxWidth: 300, marginLeft: 6 }}
          value={style}
          onChange={(e) => onStyleChange(e.target.value)}
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
        <MoveMatrix
          colors={colors}
          sizes={sizes}
          cur={cur}
          qty={qty}
          onQtyChange={onQtyChange}
        />
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
        <button className="btn primary" onClick={onSubmit}>
          <Icon name="check" size={15} /> 提交（进入待复核）
        </button>
      </div>
    </div>
  );
}
