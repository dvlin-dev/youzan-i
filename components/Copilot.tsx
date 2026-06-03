"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import type { Role } from "@/lib/constants";

type Step = { id: string; label: string; status: "running" | "done"; name?: string; icon?: string };
type Msg = {
  role: "user" | "ai";
  id: number;
  text?: string;
  thought?: string;
  steps?: Step[];
  docs?: string[];
  streaming?: boolean;
};

const SUGG: Record<Role, string[]> = {
  warehouse: ["AW2024-3301 藏青/黑/米白 M 各入 50 件", "黑色 L 卫衣 出 24 件", "哪些 SKU 快断货了？"],
  buyer: ["帮我对一下账，差在哪", "哪些 SKU 快断货了？", "查 AW2024-9902 卡其 L 库存"],
  admin: ["看看哪些快断货了，都补到 30", "AW2024-3301 藏青 M 入 30、黑 M 出 20", "帮我对一下账，差在哪"],
};

export function Copilot({ role, onClose }: { role: Role; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 1e9);
  }, [msgs, busy]);

  const patch = (id: number, fn: (m: Msg) => Msg) =>
    setMsgs((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const uid = ++idRef.current;
    const aid = ++idRef.current;
    setMsgs((m) => [...m, { role: "user", id: uid, text }, { role: "ai", id: aid, steps: [], text: "", streaming: true }]);
    setInput("");
    setBusy(true);
    let mutated = false;
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev.t === "thought") {
            patch(aid, (m) => ({ ...m, thought: (m.thought ?? "") + (ev.delta as string) }));
          } else if (ev.t === "text") {
            patch(aid, (m) => ({ ...m, text: (m.text ?? "") + (ev.delta as string) }));
          } else if (ev.t === "tool" && ev.status === "running") {
            patch(aid, (m) => {
              const steps = m.steps ?? [];
              if (steps.some((s) => s.id === ev.id)) return m;
              return { ...m, steps: [...steps, { id: ev.id as string, label: (ev.label as string) ?? (ev.name as string) ?? "工具", status: "running", name: ev.name as string, icon: ev.icon as string }] };
            });
          } else if (ev.t === "tool" && ev.status === "done") {
            patch(aid, (m) => {
              const steps = m.steps ?? [];
              const hasId = steps.some((s) => s.id === ev.id);
              let fb = false;
              return {
                ...m,
                steps: steps.map((s) => {
                  if (hasId ? s.id === ev.id : !fb && s.status === "running") {
                    fb = true;
                    return { ...s, status: "done" as const };
                  }
                  return s;
                }),
              };
            });
          } else if (ev.t === "final") {
            mutated = !!ev.mutated;
            patch(aid, (m) => ({
              ...m,
              text: m.text || (ev.text as string),
              docs: ev.docs as string[],
              streaming: false,
              steps: (m.steps ?? []).map((s) => ({ ...s, status: "done" as const })),
            }));
          } else if (ev.t === "error") {
            patch(aid, (m) => ({ ...m, text: ev.message as string, streaming: false }));
          }
        }
      }
    } catch {
      patch(aid, (m) => ({ ...m, text: "网络出错，请重试。", streaming: false }));
    }
    patch(aid, (m) => ({ ...m, streaming: false }));
    setBusy(false);
    if (mutated) router.refresh();
  }

  function goReview() {
    onClose();
    router.push("/move");
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer copilot">
        <div className="cop-head">
          <span className="cop-logo">
            <Icon name="spark" size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>AI 助手</div>
            <div className="dim" style={{ fontSize: 11.5, display: "flex", gap: 4, alignItems: "center" }}>
              <Icon name="shield" size={11} /> 经 typed 工具层 · 写操作进待复核审批
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }} aria-label="关闭 AI 助手">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="cop-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="msg ai">
              你好，我是云链 AI 助手 👋 可以用自然语言让我<b>查库存、连续出入库、对账</b>。
              {"\n\n"}出入库我会直接生成<b>待复核单</b>（一句话里多笔会一次办完）——不直接改库，去「入库/出库 → 待复核」<b>审批</b>后才入账。
            </div>
          )}
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg user">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="msg ai">
                <Trace m={m} />
                {m.text && <div className="cop-answer">{renderRich(m.text)}</div>}
                {m.docs && m.docs.length > 0 && (
                  <div className="tc-actions" style={{ marginTop: 10 }}>
                    <button className="btn primary sm" onClick={goReview}>
                      <Icon name="check" size={13} /> 去待复核审批（{m.docs.length} 张）
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        <div className="cop-foot">
          <div className="suggest">
            {SUGG[role].map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="cop-input">
            <textarea
              rows={1}
              value={input}
              placeholder="用一句话下指令…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="cop-send" onClick={() => send(input)} aria-label="发送">
              <Icon name="send" size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/** 极简富文本：把 **加粗** 渲染为 <strong>，其余按纯文本（换行由 pre-wrap 处理）。 */
function renderRich(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
  );
}

/** 过程区：思考（可折叠）+ 工具调用时间线。 */
function Trace({ m }: { m: Msg }) {
  const steps = m.steps ?? [];
  const thinking = !!m.streaming && !m.text; // 仍在朝答案推进
  const hasThought = !!m.thought;
  if (!steps.length && !hasThought && !thinking) return null;
  return (
    <div className="cop-trace">
      {hasThought && (
        <details className="cop-think" open={thinking ? true : undefined}>
          <summary>
            {thinking ? <span className="spin" /> : <Icon name="spark" size={13} />}
            <span>{thinking ? "思考中…" : "已深度思考"}</span>
            <span className="caret">
              <Icon name="chev" size={13} />
            </span>
          </summary>
          <div className="cop-think-body">{m.thought}</div>
        </details>
      )}
      {thinking && !hasThought && !steps.length && (
        <div className="cop-step running">
          <span className="chip"><span className="spin" /></span>
          <span className="lb">思考中…</span>
        </div>
      )}
      {steps.length > 0 && (
        <div className="cop-steps">
          {steps.map((s) => (
            <div className={"cop-step " + s.status} key={s.id}>
              <span className="chip">
                <Icon name={s.icon || "tool"} size={13} />
              </span>
              <span className="lb">{s.label}</span>
              <span className="st">
                {s.status === "running" ? <span className="spin" /> : <Icon name="check" size={13} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
