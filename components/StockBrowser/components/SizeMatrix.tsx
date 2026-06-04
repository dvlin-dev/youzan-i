import { COLOR_HEX } from "@/lib/constants";

import type { StyleGroup } from "../types";
import { SafetyStockEditor } from "./SafetyStockEditor";

/** 颜色 × 尺码 库存矩阵。空格子早返回占位，有 SKU 才渲染可点格子（点击查看流水）。 */
export function SizeMatrix({
  g,
  canManage,
  onOpen,
}: {
  g: StyleGroup;
  canManage: boolean;
  onOpen: (skuCode: string) => void;
}) {
  return (
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
            const rowsum = g.items
              .filter((s) => s.color === c)
              .reduce((a, s) => a + s.qty, 0);
            return (
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
                {g.sizes.map((sz) => {
                  const s = g.items.find((x) => x.color === c && x.size === sz);
                  if (!s)
                    return (
                      <td key={sz}>
                        <div className="cell empty">
                          <span className="z">—</span>
                        </div>
                      </td>
                    );
                  return (
                    <td key={sz}>
                      <div
                        className={"cell lvl-" + s.level}
                        onClick={() => onOpen(s.skuCode)}
                      >
                        <span className="q tnum">{s.qty}</span>
                        <span className="z">{sz}</span>
                      </div>
                    </td>
                  );
                })}
                <td className="num tnum" style={{ fontWeight: 700 }}>
                  {rowsum}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
        点任意格子查看该 SKU 的<b>不可变流水</b>（可追溯）
      </div>
      {canManage && (
        <SafetyStockEditor
          styleNo={g.styleNo}
          current={g.items[0]?.safetyStock ?? 0}
        />
      )}
    </div>
  );
}
