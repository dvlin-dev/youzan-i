"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { saveCount } from "@/lib/actions";
import type { CountRow } from "@/lib/stocktake/engine";

const diffColor = (d: number) =>
  d < 0 ? "var(--danger-2)" : d > 0 ? "var(--success)" : "var(--text-3)";

/** 录实盘：账面已快照，逐 SKU 填实际清点数，实时显示差异；失焦即保存（saveCount）。 */
export function StocktakeEntry({
  rows,
  onDone,
}: {
  rows: CountRow[];
  onDone: () => void;
}) {
  const [actuals, setActuals] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.skuCode, String(r.actual)])),
  );
  const router = useRouter();
  const toast = useToast();

  async function save(r: CountRow) {
    const v = parseInt(actuals[r.skuCode] ?? "", 10);
    if (!Number.isFinite(v) || v < 0 || v === r.actual) return;
    const res = await saveCount(r.skuCode, v);
    if (!res.ok) toast(res.msg, "err");
  }

  return (
    <div className="card pad">
      <div className="between" style={{ marginBottom: 10 }}>
        <h2 className="sec" style={{ margin: 0 }}>
          录实盘 · 填实际清点数（账面已快照，差异自动算）
        </h2>
        <button
          className="btn primary sm"
          onClick={() => {
            router.refresh();
            onDone();
          }}
        >
          <Icon name="check" size={13} /> 完成录入 · 去对账
        </button>
      </div>
      <div style={{ maxHeight: 460, overflowY: "auto" }}>
        <table className="tbl" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>款 / 色 / 码</th>
              <th className="num">账面</th>
              <th className="num">实盘</th>
              <th className="num">差异</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = parseInt(actuals[r.skuCode] ?? "", 10) || 0;
              const diff = v - r.book;
              return (
                <tr key={r.skuCode}>
                  <td>
                    {r.styleName}
                    <span className="dim">
                      {" "}
                      · {r.color}/{r.size}
                    </span>
                  </td>
                  <td className="num tnum">{r.book}</td>
                  <td className="num">
                    <input
                      className="qty-in"
                      inputMode="numeric"
                      value={actuals[r.skuCode] ?? ""}
                      onChange={(e) =>
                        setActuals((a) => ({
                          ...a,
                          [r.skuCode]: e.target.value,
                        }))
                      }
                      onBlur={() => save(r)}
                    />
                  </td>
                  <td className="num tnum" style={{ color: diffColor(diff) }}>
                    {diff === 0 ? "—" : (diff > 0 ? "+" : "") + diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
