"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import {
  type CopilotEvent,
  type Msg,
  makeLineSplitter,
  reduceEvent,
} from "@/lib/ai/copilot-stream";
import type { Role } from "@/lib/constants";

import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";

export function Copilot({
  role,
  onClose,
}: {
  role: Role;
  onClose: () => void;
}) {
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
    setMsgs((m) => [
      ...m,
      { role: "user", id: uid, text, parts: [] },
      { role: "ai", id: aid, parts: [], streaming: true },
    ]);
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
      const splitLines = makeLineSplitter();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const raw of splitLines(dec.decode(value, { stream: true }))) {
          let ev: CopilotEvent;
          try {
            ev = JSON.parse(raw) as CopilotEvent;
          } catch {
            continue;
          }
          if (ev.t === "final") mutated = !!ev.mutated;
          patch(aid, (m) => reduceEvent(m, ev));
        }
      }
    } catch {
      patch(aid, (m) => ({
        ...m,
        parts: [...m.parts, { kind: "text", text: "网络出错，请重试。" }],
        streaming: false,
      }));
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
            <div
              style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}
            >
              AI 助手
            </div>
            <div
              className="dim"
              style={{
                fontSize: 11.5,
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <Icon name="shield" size={11} /> 经 typed 工具层 ·
              写操作进待复核审批
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
            aria-label="关闭 AI 助手"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="cop-body" ref={bodyRef}>
          <MessageList msgs={msgs} onGoReview={goReview} />
        </div>

        <InputBar
          role={role}
          input={input}
          onInputChange={setInput}
          onSend={send}
        />
      </aside>
    </>
  );
}
