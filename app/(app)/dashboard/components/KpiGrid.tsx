import { Icon } from "@/components/icons";

import type { Kpi } from "../dashboard-kpis";

/** KPI 卡片网格：纯展示，数据经 props 传入（含角色分支后的对账卡）。 */
export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="kpis">
      {kpis.map((k) => (
        <div className="kpi" key={k.lbl}>
          <div className="top">
            <span className="lbl">{k.lbl}</span>
            <span className="ic" style={{ background: k.bg, color: k.tone }}>
              <Icon name={k.icon} size={16} />
            </span>
          </div>
          <div className="val tnum">
            {k.val}
            {k.unit && <small> {k.unit}</small>}
          </div>
          <div className="delta dim">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}
