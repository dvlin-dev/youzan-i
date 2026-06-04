import { Icon } from "@/components/icons";
import { yuan } from "@/lib/money";

import type { StyleGroup as StyleGroupT } from "../types";
import { SizeMatrix } from "./SizeMatrix";

/** 单个款分组：可折叠头（缩略图/标题/库存统计）+ 展开后的尺码矩阵。 */
export function StyleGroup({
  g,
  canCost,
  canManage,
  isOpen,
  onToggle,
  onOpen,
}: {
  g: StyleGroupT;
  canCost: boolean;
  canManage: boolean;
  isOpen: boolean | undefined;
  onToggle: () => void;
  onOpen: (skuCode: string) => void;
}) {
  const total = g.items.reduce((a, s) => a + s.qty, 0);
  const lowN = g.items.filter((s) => s.level !== "ok").length;

  function renderPill() {
    if (lowN)
      return (
        <span className="pill warn">
          <span className="dot" />
          {lowN} 个待补
        </span>
      );
    return (
      <span className="pill ok">
        <span className="dot" />
        充足
      </span>
    );
  }

  return (
    <div className="style-group">
      <div className="sg-head" onClick={onToggle}>
        <span
          style={{
            transform: isOpen ? "rotate(90deg)" : "none",
            transition: ".2s",
            color: "var(--text-3)",
            display: "inline-flex",
          }}
        >
          <Icon name="chev" size={16} />
        </span>
        <span className="sg-thumb" style={{ background: g.tint }}>
          {g.category.slice(0, 2)}
        </span>
        <div>
          <div className="sg-title">{g.styleName}</div>
          <div className="sg-meta">
            {g.styleNo} · {g.colors.length}色 × {g.sizes.length}码
            {canCost ? ` · 成本 ${yuan(g.costPrice)}` : ""} · 吊牌{" "}
            {yuan(g.tagPrice)}
          </div>
        </div>
        <div className="sg-stat">
          {renderPill()}
          <div>
            <div className="n tnum">{total}</div>
            <div className="k">总库存(件)</div>
          </div>
        </div>
      </div>
      {isOpen && <SizeMatrix g={g} canManage={canManage} onOpen={onOpen} />}
    </div>
  );
}
