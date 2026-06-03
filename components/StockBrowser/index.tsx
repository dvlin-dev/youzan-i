"use client";
import { useMemo, useState } from "react";

import { LedgerDrawer } from "@/components/LedgerDrawer";
import { Icon } from "@/components/icons";
import { filterStyleGroups, groupSkusByStyle } from "@/lib/stock-view";

import { StyleGroup } from "./components/StyleGroup";
import type { SkuRow } from "./types";

export type { SkuRow } from "./types";

export function StockBrowser({
  skus,
  canCost,
}: {
  skus: SkuRow[];
  canCost: boolean;
}) {
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<string | null>(null);

  const styles = useMemo(() => groupSkusByStyle(skus), [skus]);
  const list = filterStyleGroups(styles, { q, lowOnly });

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input
            placeholder="搜索款号 / 品名 / 条码…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label
          className="row"
          style={{
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text-2)",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />{" "}
          只看低库存
        </label>
        <div style={{ marginLeft: "auto" }} className="dim">
          共 {skus.length} 个 SKU · {styles.length} 款
        </div>
      </div>

      {list.length === 0 && (
        <div className="empty">
          <div className="e-ic">
            <Icon name="search" size={26} />
          </div>
          <h3>没有匹配的款号</h3>
        </div>
      )}

      {list.map((g) => (
        <StyleGroup
          key={g.styleNo}
          g={g}
          canCost={canCost}
          isOpen={open[g.styleNo]}
          onToggle={() =>
            setOpen((o) => ({ ...o, [g.styleNo]: !o[g.styleNo] }))
          }
          onOpen={setDrawer}
        />
      ))}

      {drawer && (
        <LedgerDrawer
          skuCode={drawer}
          canCost={canCost}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}
