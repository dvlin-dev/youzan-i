import type { Dispatch, SetStateAction } from "react";

import { COLOR_HEX } from "@/lib/constants";

import type { SkuRow } from "../types";

/** 颜色 × 尺码 矩阵录入表。空格子早返回占位，有 SKU 才渲染输入框。 */
export function MoveMatrix({
  colors,
  sizes,
  cur,
  qty,
  onQtyChange,
}: {
  colors: string[];
  sizes: string[];
  cur: SkuRow[];
  qty: Record<string, string>;
  onQtyChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
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
                        onQtyChange((q) => ({
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
  );
}
