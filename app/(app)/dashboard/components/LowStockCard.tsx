import Link from "next/link";

import { Icon } from "@/components/icons";
import { levelOf } from "@/lib/db/queries";
import type { Sku } from "@/lib/db/schema";

/** 库存预警卡：纯展示，低库存 SKU 列表与库存映射经 props 传入。 */
export function LowStockCard({
  low,
  sm,
}: {
  low: Sku[];
  sm: Record<string, number>;
}) {
  return (
    <div className="card">
      <div className="between pad" style={{ paddingBottom: 8 }}>
        <h2 className="sec" style={{ margin: 0 }}>
          库存预警 · 该补货了
        </h2>
        <Link href="/stock" className="btn sm ghost">
          查看全部 <Icon name="chev" size={14} />
        </Link>
      </div>
      <div className="pad" style={{ paddingTop: 6 }}>
        {low.length === 0 && (
          <div className="empty ok">
            <div className="e-ic">
              <Icon name="check" size={26} />
            </div>
            <h3>库存健康，暂无预警</h3>
          </div>
        )}
        {low.slice(0, 6).map((s) => {
          const q = sm[s.skuCode] ?? 0;
          const lv = levelOf(q, s.safetyStock);
          return (
            <Link
              href="/stock"
              key={s.skuCode}
              className="alert-row clickable"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className={"pill " + (lv === "danger" ? "danger" : "warn")}>
                <span className="dot" />
                {lv === "danger" ? "断码" : "偏低"}
              </span>
              <div>
                <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {s.styleName}{" "}
                  <span className="dim">
                    / {s.color} / {s.size}
                  </span>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {s.styleNo} · 安全库存 {s.safetyStock}
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div
                  className="tnum"
                  style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: lv === "danger" ? "var(--danger-2)" : "var(--warn)",
                  }}
                >
                  {q}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  当前库存
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
