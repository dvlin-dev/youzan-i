import { Icon } from "@/components/icons";
import { DEMO_MODE } from "@/lib/constants";

import { STEPS, fmt } from "../types";

/** 头部信息条：单号 / 状态 / 范围 / 快照时间 + 过账或重置按钮 + 时间线。 */
export function StocktakeHeader({
  pdNo,
  status,
  scope,
  counter,
  snapTs,
  countedAt,
  posted,
  canPost,
  busy,
  openCount,
  onPostAll,
  onReset,
}: {
  pdNo: string;
  status: string;
  scope: string;
  counter: string;
  snapTs: string;
  countedAt: string;
  posted: boolean;
  canPost: boolean;
  busy: boolean;
  openCount: number;
  onPostAll: () => void;
  onReset: () => void;
}) {
  const active = posted ? 4 : 2;

  // 右上角动作：已过账 → 重置；未过账 → 全部过账。早返回，不在 JSX 里堆三元。
  function renderAction() {
    if (!canPost) return null;
    if (posted) {
      if (!DEMO_MODE) return null;
      return (
        <button className="btn sm" onClick={onReset} disabled={busy}>
          <Icon name="clock" size={14} /> 重置演示数据
        </button>
      );
    }
    return (
      <button
        className="btn primary sm"
        onClick={onPostAll}
        disabled={busy || openCount === 0}
      >
        <Icon name="check" size={14} /> 全部过账（记差异流水 · 老板审批）
      </button>
    );
  }

  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div
        className="between"
        style={{ alignItems: "flex-start", marginBottom: 10 }}
      >
        <div>
          <div className="row" style={{ gap: 8 }}>
            <b style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{pdNo}</b>
            <span className={"pill " + (posted ? "ok" : "warn")}>
              <span className="dot" />
              {status}
            </span>
          </div>
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
            {scope} · 账面快照 {fmt(snapTs)} · 实盘录入 {counter} @{" "}
            {fmt(countedAt)}
          </div>
        </div>
        {renderAction()}
      </div>
      <div className="timeline" style={{ maxWidth: 600 }}>
        {STEPS.map((s, i) => (
          <div
            className={
              "tl-step " + (i < active ? "done" : i === active ? "cur" : "")
            }
            key={s}
          >
            {i > 0 && <span className="tl-line" />}
            <span className="d">{i < active ? "✓" : i + 1}</span>
            <span className="t">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
