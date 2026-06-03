import { describe, expect, it } from "vitest";

import {
  type CopilotEvent,
  type Msg,
  makeLineSplitter,
  reduceEvent,
} from "../lib/ai/copilot-stream";

const ai = (parts: Msg["parts"] = [], extra: Partial<Msg> = {}): Msg => ({
  role: "ai",
  id: 1,
  parts,
  streaming: true,
  ...extra,
});

describe("makeLineSplitter · 增量 NDJSON 行切分", () => {
  it("跨 chunk 的半行留到下个 chunk 才吐出", () => {
    const split = makeLineSplitter();
    expect(split('{"a":1}\n{"b":')).toEqual(['{"a":1}']);
    expect(split("2}\n")).toEqual(['{"b":2}']);
  });
  it("一次多行 + 跳过空行", () => {
    const split = makeLineSplitter();
    expect(split("a\n\n b \nc")).toEqual(["a", "b"]); // c 还没换行，留 buffer
    expect(split("\n")).toEqual(["c"]);
  });
});

describe("reduceEvent · 事件折叠进消息（纯函数）", () => {
  it("thought / text 同类增量合并到末尾 part", () => {
    let m = ai();
    m = reduceEvent(m, { t: "thought", delta: "想" });
    m = reduceEvent(m, { t: "thought", delta: "一下" });
    m = reduceEvent(m, { t: "text", delta: "答" });
    expect(m.parts).toEqual([
      { kind: "thought", text: "想一下" },
      { kind: "text", text: "答" },
    ]);
  });

  it("tool running 新增；同 id 重复事件不重复添加", () => {
    let m = ai();
    m = reduceEvent(m, {
      t: "tool",
      id: "t1",
      label: "查库存",
      status: "running",
    });
    m = reduceEvent(m, {
      t: "tool",
      id: "t1",
      label: "查库存",
      status: "running",
    });
    expect(m.parts.filter((p) => p.kind === "tool")).toHaveLength(1);
  });

  it("tool done 按 id 标完成", () => {
    let m = ai([{ kind: "tool", id: "t1", label: "x", status: "running" }]);
    m = reduceEvent(m, { t: "tool", id: "t1", status: "done" });
    expect(m.parts[0]).toMatchObject({ kind: "tool", status: "done" });
  });

  it("tool done 兜底：id 匹配不到时，标记第一个仍 running 的工具", () => {
    const m0 = ai([
      { kind: "tool", id: "a", label: "x", status: "done" },
      { kind: "tool", id: "b", label: "y", status: "running" },
      { kind: "tool", id: "c", label: "z", status: "running" },
    ]);
    const m = reduceEvent(m0, { t: "tool", id: "未知", status: "done" });
    const tools = m.parts.filter((p) => p.kind === "tool");
    expect(tools.map((p) => (p as { status: string }).status)).toEqual([
      "done",
      "done",
      "running",
    ]); // 只标了第一个 running（b），c 不动
  });

  it("final：无 text part 时补上 ev.text，所有 running 工具置 done，记 docs、停流", () => {
    const m0 = ai([{ kind: "tool", id: "t1", label: "x", status: "running" }]);
    const m = reduceEvent(m0, {
      t: "final",
      mutated: true,
      docs: ["IN-1"],
      text: "完成",
    });
    expect(m.streaming).toBe(false);
    expect(m.docs).toEqual(["IN-1"]);
    expect(m.parts.some((p) => p.kind === "text" && p.text === "完成")).toBe(
      true,
    );
    expect(m.parts.find((p) => p.kind === "tool")).toMatchObject({
      status: "done",
    });
  });

  it("final：已有 text part 时不重复补 text", () => {
    const m0 = ai([{ kind: "text", text: "已答" }]);
    const m = reduceEvent(m0, {
      t: "final",
      mutated: false,
      docs: [],
      text: "完成",
    });
    expect(m.parts.filter((p) => p.kind === "text")).toHaveLength(1);
  });

  it("error：追加错误文本并停流", () => {
    const m = reduceEvent(ai(), { t: "error", message: "出错了" });
    expect(m.streaming).toBe(false);
    expect(m.parts).toEqual([{ kind: "text", text: "出错了" }]);
  });

  it("未知事件原样返回", () => {
    const m0 = ai([{ kind: "text", text: "x" }]);
    expect(reduceEvent(m0, { t: "weird" } as unknown as CopilotEvent)).toBe(m0);
  });
});
