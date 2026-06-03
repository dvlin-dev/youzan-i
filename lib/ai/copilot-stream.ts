/**
 * Copilot 流式协议的**共享纯逻辑**：服务端（copilot.ts）与客户端（Copilot.tsx）共用同一套
 * 事件类型，客户端把「NDJSON 字节流 → 逐事件折叠进消息」这段可测逻辑放这里（不藏在 fetch 回调里）。
 * 无 IO、无 React、无 server-only 依赖——两端都可 import，且可单测。
 */

/** 流式事件：前端据此实时渲染「思考 + 工具调用 + 回答」。服务端 streamCopilot 产出、客户端消费。 */
export type CopilotEvent =
  | { t: "thought"; delta: string }
  | {
      t: "tool";
      id: string;
      name?: string;
      label?: string;
      status: "running" | "done";
    }
  | { t: "text"; delta: string }
  | { t: "final"; mutated: boolean; docs: string[]; text: string }
  | { t: "error"; message: string };

/** AI 消息按「时间顺序」由若干 part 组成：思考 / 工具 / 文本，依到达顺序追加。 */
export type Part =
  | { kind: "thought"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; label: string; status: "running" | "done" };

export type Msg = {
  role: "user" | "ai";
  id: number;
  text?: string;
  parts: Part[];
  docs?: string[];
  streaming?: boolean;
};

/** 把增量 delta 追加进同类（thought/text）的末尾 part，否则新起一个 part。 */
export function appendText(
  parts: Part[],
  kind: "thought" | "text",
  delta: string,
): Part[] {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) {
    return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...parts, { kind, text: delta }];
}

/** 把一个流式事件折叠进 AI 消息，返回新消息（纯函数）。未知事件原样返回。 */
export function reduceEvent(m: Msg, ev: CopilotEvent): Msg {
  switch (ev.t) {
    case "thought":
      return { ...m, parts: appendText(m.parts, "thought", ev.delta) };
    case "text":
      return { ...m, parts: appendText(m.parts, "text", ev.delta) };
    case "tool": {
      if (ev.status === "running") {
        if (m.parts.some((p) => p.kind === "tool" && p.id === ev.id)) return m;
        const label = ev.label ?? ev.name ?? "工具";
        return {
          ...m,
          parts: [
            ...m.parts,
            { kind: "tool", id: ev.id, label, status: "running" },
          ],
        };
      }
      // done：优先按 id 匹配；匹配不到则把「第一个仍在运行」的工具标完成（兜底，与原行为一致）。
      const hasId = m.parts.some((p) => p.kind === "tool" && p.id === ev.id);
      let fallbackUsed = false;
      return {
        ...m,
        parts: m.parts.map((p) => {
          if (p.kind !== "tool") return p;
          if (
            hasId ? p.id === ev.id : !fallbackUsed && p.status === "running"
          ) {
            fallbackUsed = true;
            return { ...p, status: "done" };
          }
          return p;
        }),
      };
    }
    case "final": {
      let parts = m.parts;
      if (ev.text && !parts.some((p) => p.kind === "text")) {
        parts = [...parts, { kind: "text", text: ev.text }];
      }
      parts = parts.map((p) =>
        p.kind === "tool" && p.status === "running"
          ? { ...p, status: "done" }
          : p,
      );
      return { ...m, parts, docs: ev.docs, streaming: false };
    }
    case "error":
      return {
        ...m,
        parts: [...m.parts, { kind: "text", text: ev.message }],
        streaming: false,
      };
    default:
      return m;
  }
}

/**
 * 增量 NDJSON 行切分器：喂入解码后的 chunk，吐出本次新凑齐的整行（已 trim、去空行）；
 * 不完整的尾巴留在内部 buffer 等下个 chunk。
 */
export function makeLineSplitter(): (chunk: string) => string[] {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    const lines: string[] = [];
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (raw) lines.push(raw);
    }
    return lines;
  };
}
