"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import type { Role } from "@/lib/constants";

type Msg = { role: "user" | "ai"; text?: string; docs?: string[] };

const SUGG: Record<Role, string[]> = {
  warehouse: ["AW2024-3301 藏青/黑/米白 M 各入 50 件", "黑色 L 卫衣 出 24 件", "哪些 SKU 快断货了？"],
  buyer: ["帮我对一下账，差在哪", "哪些 SKU 快断货了？", "查 AW2024-9902 卡其 L 库存"],
  admin: ["AW2024-3301 藏青 M 入 30、黑 M 出 20", "帮我对一下账，差在哪", "哪些 SKU 快断货了？"],
};

export function Copilot({ role, onClose }: { role: Role; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 1e9);
  }, [msgs, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "ai", text: data.text, docs: data.docs }]);
      // 本轮有出入库写操作 → 刷新待复核角标
      if (data.mutated) router.refresh();
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "网络出错，请重试。" }]);
    }
    setBusy(false);
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
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg user">
                {m.text}
              </div>
            ) : (
              <div key={i} className="msg ai">
                {m.text}
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
          {busy && <div className="msg ai dim">思考中…</div>}
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
