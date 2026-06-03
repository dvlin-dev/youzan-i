"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { submitMove } from "@/lib/actions";
import type { Role } from "@/lib/constants";

type Preview = { type: "IN" | "OUT"; skuCode: string; qty: number };
type Msg = { role: "user" | "ai"; text?: string; preview?: Preview; note?: string; done?: string };

const SUGG: Record<Role, string[]> = {
  warehouse: ["AW2024-3301 藏青 M 入 50 件", "黑色 L 卫衣 出 24 件", "哪些 SKU 快断货了？"],
  buyer: ["帮我对一下账，差在哪", "哪些 SKU 快断货了？", "查 AW2024-9902 卡其 L 库存"],
  admin: ["帮我对一下账，差在哪", "AW2024-3301 藏青 M 出 20 件", "哪些 SKU 快断货了？"],
};

export function Copilot({ role, onClose }: { role: Role; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
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
      if (data.kind === "preview")
        setMsgs((m) => [...m, { role: "ai", text: "好的，我把你这句话编译成了一次工具调用，请确认：", preview: data.action, note: data.note }]);
      else setMsgs((m) => [...m, { role: "ai", text: data.text }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "网络出错，请重试。" }]);
    }
    setBusy(false);
  }

  async function confirm(i: number, p: Preview) {
    const r = await submitMove({ type: p.type, entries: [{ skuCode: p.skuCode, qty: p.qty }] });
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) {
      setMsgs((m) => m.map((x, idx) => (idx === i ? { ...x, preview: undefined, done: r.msg } : x)));
      router.refresh();
    }
  }
  function cancel(i: number) {
    setMsgs((m) => m.map((x, idx) => (idx === i ? { ...x, preview: undefined, done: "已取消" } : x)));
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
              <Icon name="shield" size={11} /> 经 typed 工具层 · 写操作需你确认
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }} aria-label="关闭 AI 助手">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="cop-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="msg ai">
              你好，我是云链 AI 助手 👋 可以用自然语言让我<b>查库存、出入库、对账</b>。
              {"\n\n"}我不会直接改数据库——写操作会先生成一张<b>工具调用预览</b>，经你确认 / 他人复核后才落库（typed 工具层 + HITL）。
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
                {m.preview && (
                  <div className="toolcard">
                    <div className="tc-h">
                      <Icon name="tool" size={13} /> 工具调用预览 · append_ledger()
                    </div>
                    <pre>
{JSON.stringify(
  {
    sku: m.preview.skuCode,
    type: m.preview.type,
    delta: m.preview.type === "IN" ? m.preview.qty : -m.preview.qty,
    bizType: m.preview.type === "IN" ? "采购到货" : "销售出库",
  },
  null,
  2,
)}
                    </pre>
                    <div className="hitl">
                      <Icon name="shield" size={13} /> {m.note}
                    </div>
                    <div className="tc-actions">
                      <button className="btn primary sm" onClick={() => confirm(i, m.preview!)}>
                        <Icon name="check" size={13} /> 确认并提交复核
                      </button>
                      <button className="btn sm" onClick={() => cancel(i)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {m.done && (
                  <div className="hitl" style={{ borderRadius: 8, marginTop: 8, borderTop: "none" }}>
                    <Icon name="check" size={13} /> {m.done}
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
