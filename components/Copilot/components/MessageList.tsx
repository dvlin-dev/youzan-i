import { Streamdown } from "streamdown";

import { Icon } from "@/components/icons";
import type { Msg, Part } from "@/lib/ai/copilot-stream";

/** 单个 part 渲染：thought / tool / answer 三类用早返回扁平分支，不堆累积三元。 */
function renderPart(p: Part, i: number) {
  if (p.kind === "thought")
    return (
      <div key={i} className="cop-thought">
        {p.text.replace(/\*\*/g, "")}
      </div>
    );
  if (p.kind === "tool")
    return (
      <div key={p.id} className={"cop-tool " + p.status}>
        <span className="lb">{p.label}</span>
        <span className="st">
          {p.status === "running" ? (
            <span className="spin" />
          ) : (
            <Icon name="check" size={13} />
          )}
        </span>
      </div>
    );
  return (
    <div key={i} className="cop-answer">
      <Streamdown>{p.text}</Streamdown>
    </div>
  );
}

function AiMessage({ m, onGoReview }: { m: Msg; onGoReview: () => void }) {
  return (
    <div className="msg ai">
      {m.parts.map((p, i) => renderPart(p, i))}
      {m.streaming &&
        !m.parts.some((p) => p.kind === "tool" && p.status === "running") && (
          <div className="cop-loading">
            <span className="spin" />
          </div>
        )}
      {m.docs && m.docs.length > 0 && (
        <div className="tc-actions" style={{ marginTop: 10 }}>
          <button className="btn primary sm" onClick={onGoReview}>
            <Icon name="check" size={13} /> 去待复核审批（
            {m.docs.length} 张）
          </button>
        </div>
      )}
    </div>
  );
}

export function MessageList({
  msgs,
  onGoReview,
}: {
  msgs: Msg[];
  onGoReview: () => void;
}) {
  return (
    <>
      {msgs.length === 0 && (
        <div className="msg ai">
          你好，我是云链 AI 助手 👋 可以用自然语言让我
          <b>查库存、连续出入库、对账</b>。
        </div>
      )}
      {msgs.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="msg user">
            {m.text}
          </div>
        ) : (
          <AiMessage key={m.id} m={m} onGoReview={onGoReview} />
        ),
      )}
    </>
  );
}
