"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import type { Role } from "@/lib/constants";

/** AI 消息按「时间顺序」由若干 part 组成：思考 / 工具 / 文本，依到达顺序追加。 */
type Part =
  | { kind: "thought"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; label: string; status: "running" | "done" };
type Msg = { role: "user" | "ai"; id: number; text?: string; parts: Part[]; docs?: string[]; streaming?: boolean };

const SUGG: Record<Role, string[]> = {
  warehouse: ["AW2024-3301 藏青/黑/米白 M 各入 50 件", "黑色 L 卫衣 出 24 件", "哪些 SKU 快断货了？"],
  buyer: ["帮我对一下账，差在哪", "哪些 SKU 快断货了？", "查 AW2024-9902 卡其 L 库存"],
  admin: ["看看哪些快断货了，都补到 30", "AW2024-3301 藏青 M 入 30、黑 M 出 20", "帮我对一下账，差在哪"],
};

/** 极简富文本：把 **加粗** 渲染为 <strong>，其余按纯文本（换行由 pre-wrap 处理）。 */
function renderRich(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
  );
}

const appendText = (parts: Part[], kind: "thought" | "text", delta: string): Part[] => {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  return [...parts, { kind, text: delta } as Part];
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

  const patch = (id: number, fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const uid = ++idRef.current;
    const aid = ++idRef.current;
    setMsgs((m) => [...m, { role: "user", id: uid, text, parts: [] }, { role: "ai", id: aid, parts: [], streaming: true }]);
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
            patch(aid, (m) => ({ ...m, parts: appendText(m.parts, "thought", ev.delta as string) }));
          } else if (ev.t === "text") {
            patch(aid, (m) => ({ ...m, parts: appendText(m.parts, "text", ev.delta as string) }));
          } else if (ev.t === "tool" && ev.status === "running") {
            patch(aid, (m) =>
              m.parts.some((p) => p.kind === "tool" && p.id === ev.id)
                ? m
                : { ...m, parts: [...m.parts, { kind: "tool", id: ev.id as string, label: (ev.label as string) ?? (ev.name as string) ?? "工具", status: "running" }] },
            );
          } else if (ev.t === "tool" && ev.status === "done") {
            patch(aid, (m) => {
              const hasId = m.parts.some((p) => p.kind === "tool" && p.id === ev.id);
              let fb = false;
              return {
                ...m,
                parts: m.parts.map((p) => {
                  if (p.kind !== "tool") return p;
                  if (hasId ? p.id === ev.id : !fb && p.status === "running") {
                    fb = true;
                    return { ...p, status: "done" };
                  }
                  return p;
                }),
              };
            });
          } else if (ev.t === "final") {
            mutated = !!ev.mutated;
            patch(aid, (m) => {
              let parts = m.parts;
              if (ev.text && !parts.some((p) => p.kind === "text")) parts = [...parts, { kind: "text", text: ev.text as string }];
              parts = parts.map((p) => (p.kind === "tool" && p.status === "running" ? { ...p, status: "done" } : p));
              return { ...m, parts, docs: ev.docs as string[], streaming: false };
            });
          } else if (ev.t === "error") {
            patch(aid, (m) => ({ ...m, parts: [...m.parts, { kind: "text", text: ev.message as string }], streaming: false }));
          }
        }
      }
    } catch {
      patch(aid, (m) => ({ ...m, parts: [...m.parts, { kind: "text", text: "网络出错，请重试。" }], streaming: false }));
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
                {m.parts.map((p, i) => {
                  if (p.kind === "thought") return <div key={i} className="cop-thought">{p.text}</div>;
                  if (p.kind === "tool")
                    return (
                      <div key={p.id} className={"cop-tool " + p.status}>
                        <span className="lb">{p.label}</span>
                        <span className="st">{p.status === "running" ? <span className="spin" /> : <Icon name="check" size={13} />}</span>
                      </div>
                    );
                  return (
                    <div key={i} className="cop-answer">
                      {renderRich(p.text)}
                    </div>
                  );
                })}
                {m.streaming && !m.parts.some((p) => p.kind === "tool" && p.status === "running") && (
                  <div className="cop-loading">
                    <span className="spin" />
                  </div>
                )}
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
