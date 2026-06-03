import { Icon } from "@/components/icons";
import type { Attribution } from "@/lib/stocktake/attribution";

/** 盘点差异的 AI 两层归因块：第 1 层证据 + 第 2 层 LLM 解释 + 采纳/已采纳。 */
export function ReconAttribution({
  attr,
  resolved,
  skuCode,
  onAdopt,
  explain,
  explaining,
  onExplain,
}: {
  attr: Attribution;
  resolved: boolean;
  skuCode: string;
  onAdopt?: (skuCode: string) => void;
  explain: string | null;
  explaining: boolean;
  onExplain: () => void;
}) {
  // 第 2 层解释：未触发 → 按钮；已返回 → 解释块。早返回，不在 JSX 里堆三元。
  function renderExplain() {
    if (explain == null) {
      return (
        <button
          className="btn sm ghost"
          onClick={onExplain}
          disabled={explaining}
          style={{ width: "100%", justifyContent: "center" }}
          aria-label="让 AI 对成因排序并深入解释"
        >
          <Icon name="spark" size={13} />{" "}
          {explaining ? "AI 分析中…" : "让 AI 深度归因（第 2 层 · 排序假设）"}
        </button>
      );
    }
    return (
      <div
        className="ev"
        style={{
          background: "var(--primary-weak)",
          borderColor: "var(--border)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "var(--primary)",
            marginBottom: 5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="spark" size={13} /> AI 第 2 层解释（基于上方检测器证据）
        </div>
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{explain}</p>
      </div>
    );
  }

  // 采纳页脚：已采纳 → 提示；可采纳 → 按钮；否则不显示。早返回。
  function renderAdoptFooter() {
    if (resolved) {
      return (
        <div
          className="hitl"
          style={{ borderRadius: 8, marginTop: 10, borderTop: "none" }}
        >
          <Icon name="check" size={13} /> 已采纳并生成调整流水
        </div>
      );
    }
    if (onAdopt) {
      return (
        <button
          className="btn primary sm"
          style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
          onClick={() => onAdopt(skuCode)}
        >
          <Icon name="check" size={13} /> 采纳：{attr.fixLabel}（需老板复核）
        </button>
      );
    }
    return null;
  }

  return (
    <div className="attrib">
      <div className="ah">
        <Icon name="spark" size={16} /> AI 差异归因
        <span className={"pill " + attr.tone}>
          <span className="dot" />
          {attr.badge}
        </span>
        <span className="dim" style={{ fontWeight: 500, fontSize: 12 }}>
          置信度 {attr.conf}
        </span>
      </div>
      <p>{attr.reason}</p>
      <div className="ev">
        <div
          style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 5 }}
        >
          检测器命中的证据
        </div>
        {attr.ev.map((e, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
              marginTop: 2,
            }}
          >
            <span style={{ color: "var(--success)", flex: "none" }}>
              <Icon name="check" size={12} />
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>
              {e}
            </span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 8 }}>
        <b>建议：</b>
        {attr.sug}
      </p>

      <div
        style={{
          marginTop: 10,
          borderTop: "1px dashed var(--border)",
          paddingTop: 10,
        }}
      >
        {renderExplain()}
      </div>

      {renderAdoptFooter()}
    </div>
  );
}
