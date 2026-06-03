import { yuan } from "@/lib/money";

import { type Row, signColor } from "../types";

/** 差异明细表：每行可点开抽屉，差异 / 金额列用 signColor 上色。 */
export function DiffTable({
  rows,
  openCount,
  onSelect,
}: {
  rows: Row[];
  openCount: number;
  onSelect: (r: Row) => void;
}) {
  return (
    <div className="card">
      <div className="between pad" style={{ paddingBottom: 10 }}>
        <h2 className="sec" style={{ margin: 0 }}>
          差异明细 · {openCount} 项待处理（按金额倒序）
        </h2>
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
            <tr
              key={r.skuCode}
              className="clickable"
              onClick={() => onSelect(r)}
              style={r.resolved ? { opacity: 0.55 } : undefined}
            >
              <td>
                <b>{r.styleName}</b>{" "}
                <span className="dim">
                  / {r.color} / {r.size}
                </span>
                <div className="ld-doc">{r.styleNo}</div>
              </td>
              <td className="num tnum">{r.book}</td>
              <td className="num tnum">{r.actual}</td>
              <td
                className="num tnum"
                style={{ color: signColor(r.diff), fontWeight: 700 }}
              >
                {r.diff > 0 ? "+" : ""}
                {r.diff}
              </td>
              <td
                className="num tnum"
                style={{ color: signColor(r.val), fontWeight: 700 }}
              >
                {yuan(r.val)}
              </td>
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
  );
}
