import { allSkus } from "@/lib/db/queries";
import { type Role } from "@/lib/constants";
import { aiEnabled, getOpenAIClient } from "./client";
import { createTools, type RecordedMove } from "./tools";

export { aiEnabled };

/** 流式事件：前端据此实时渲染「思考 + 工具调用 + 回答」。 */
export type CopilotEvent =
  | { t: "thought"; delta: string }
  | { t: "tool"; id: string; name?: string; label?: string; status: "running" | "done" }
  | { t: "text"; delta: string }
  | { t: "final"; mutated: boolean; docs: string[]; text: string }
  | { t: "error"; message: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 工具调用的人类可读标签（展示在过程时间线上）。 */
function toolLabel(name: string, args: Record<string, unknown>): string {
  const sku = [args.styleNo, args.color && args.size ? `${args.color}/${args.size}` : args.color]
    .filter(Boolean)
    .join(" ");
  switch (name) {
    case "query_stock":
      return `查询库存 ${sku}`.trim();
    case "low_stock":
      return "查询低库存 / 断货";
    case "recon_summary":
      return "盘点对账汇总";
    case "record_move": {
      const t = args.type === "OUT" ? "登记出库" : "登记入库";
      const sign = args.type === "OUT" ? "−" : "+";
      return `${t} ${sku} ${sign}${args.qty}`.trim();
    }
    default:
      return name;
  }
}

let configured = false;
// 动态加载，避免 @openai/agents 在构建期被求值（其 import 期初始化会让 next build 收集页面数据时崩溃）。
async function loadAgents() {
  const agents = await import("@openai/agents");
  if (!configured) {
    agents.setDefaultOpenAIClient(await getOpenAIClient());
    agents.setOpenAIAPI("chat_completions"); // 第三方网关用 Chat Completions，不走 Responses API
    agents.setTracingDisabled(true);
    configured = true;
  }
  return agents;
}

async function catalog() {
  const skus = await allSkus();
  const byStyle = new Map<string, { name: string; colors: Set<string>; sizes: Set<string> }>();
  for (const s of skus) {
    const e = byStyle.get(s.styleNo) ?? { name: s.styleName, colors: new Set(), sizes: new Set() };
    e.colors.add(s.color);
    e.sizes.add(s.size);
    byStyle.set(s.styleNo, e);
  }
  return [...byStyle.entries()]
    .map(([no, e]) => `${no} ${e.name}｜色:${[...e.colors].join("/")}｜码:${[...e.sizes].join("/")}`)
    .join("\n");
}

export async function* streamCopilot(message: string, role: Role): AsyncGenerator<CopilotEvent> {
  if (!aiEnabled()) {
    yield {
      t: "final",
      mutated: false,
      docs: [],
      text: "AI 助手未配置（缺少 OPENAI_API_KEY）。当前为降级模式：请直接用页面上的「录入出入库 / 盘点对账」操作。",
    };
    return;
  }

  let agents: Awaited<ReturnType<typeof loadAgents>>;
  try {
    agents = await loadAgents();
  } catch (e) {
    yield { t: "error", message: "AI 模块加载失败：" + errMsg(e) };
    return;
  }
  const { Agent, run } = agents;

  const skus = await allSkus();
  const skuSet = new Set(skus.map((s) => s.skuCode));
  const recorded: RecordedMove[] = [];
  const tools = createTools(agents, { role, skus, skuSet, recorded });

  const cat = await catalog();
  const effort = (process.env.OPENAI_REASONING_EFFORT ?? "medium") as
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh";
  const agent = new Agent({
    name: "云链进销存助手",
    model: process.env.OPENAI_MODEL,
    // 开启思考 + 允许并行工具调用：一轮内多笔出入库可一并发出，配合带随机串的单号避免撞单。
    modelSettings: { reasoning: { effort }, parallelToolCalls: true },
    instructions: `# 身份
你是服装批发进销存系统「云链」的 AI 助手，服务当前用户（角色：${role}）。你像一个对库存了如指掌的资深同事——干练、利落、靠谱：能直接办的就办利索，把用户模糊的话翻译成准确的库存动作。

# 能力
查库存、查低库存/断码、盘点对账汇总、登记入库/出库（生成待复核单）。所有写操作都先进「待复核」、审批后才入账——安全闸在后面兜着，所以你可以放手登记。

# 回应风格
干练、口语、像同事搭话；先给结论再给细节。诚实优先：不确定就直说，别硬编。闲聊一两句带过。

# 示例
<examples>
<example>
<user>看看哪些快断货了，都给我补到 30</user>
<assistant>先用 low_stock 查出低库存的几个 SKU 及其当前库存，再对每个调 record_move 入库 (30−当前库存)，最后汇报：
「已登记 5 张入库待复核单：米白/S +30、墨绿/M +18、酒红/M +18、酒红/2XL +30、酒红/L +18。去『入库/出库 → 待复核』审批即可入账。」</assistant>
</example>
<example>
<user>AW2024-3301 藏青 M 出 20</user>
<assistant>款号、色码、数量都齐了，直接 record_move 出库，再回：「已登记出库待复核单 AW2024-3301 藏青/M −20，去待复核审批。」</assistant>
</example>
<example>
<user>帮我入个库</user>
<assistant>这是真缺关键信息，问一句：「入哪个款？颜色尺码、多少件？给我这几样我就登记。」</assistant>
</example>
<example>
<user>这月账对得上吗</user>
<assistant>调 recon_summary，回汇总：「盘亏毛额 −¥3.1 万；AI 归因后真损失约 ¥1.2 万、可追回 ¥0.93 万。想看某个 SKU 的明细我再展开。」</assistant>
</example>
</examples>

# 执行循环
- 一轮里能连续调多个工具，把事一次办完，别办一件就停下来问。
- 信息已经拿得到（工具结果 / 上文 / 下方目录）时就直接动手——这样用户少打字、更顺手。
- 「补到 N 件」= 入库 (N − 当前库存)，当前库存先用 low_stock / query_stock 拿；已经 ≥ N 就跳过并说明。
- 「把这些 / 快断货的都补到 N」指的就是你刚 low_stock 出来的那批，逐个 record_move——它已给全款号/颜色/尺码，照用即可。

# 工具策略
- query_stock / low_stock / recon_summary 只读，放心调。
- record_move 直接生成待复核单，不必在对话里二次确认（审批闸兜底）；多笔就多次调用。

# 安全边界
- 只对下方目录里真实存在的 款号/颜色/尺码下单；查不到就请用户核对再下——编 SKU 会生成错单。
- 数量确实缺、又推不出来时，先问清再下单，别瞎填数。
- 写操作只生成待复核单：说「已登记/待审批」，别说「已入库/已出库/已入账」——它们还没入账。

# 语言
中文回答。颜色去掉多余的"色"字（藏青色→藏青）；尺码用 S/M/L/XL/2XL。

# 商品目录（映射 款号/颜色/尺码 的唯一依据）
${cat}`,
    tools,
  });

  let streamedText = "";
  try {
    const stream = await run(agent, message, { stream: true });
    for await (const ev of stream) {
      if (ev.type === "raw_model_stream_event") {
        const d = ev.data as { type?: string; delta?: unknown };
        if (d?.type === "output_text_delta" && typeof d.delta === "string") {
          streamedText += d.delta;
          yield { t: "text", delta: d.delta };
        } else if ((d?.type === "reasoning" || d?.type === "reasoning_text") && typeof d.delta === "string") {
          yield { t: "thought", delta: d.delta };
        }
      } else if (ev.type === "run_item_stream_event") {
        if (ev.name === "tool_called") {
          const raw = (ev.item as { rawItem?: Record<string, unknown> })?.rawItem ?? {};
          const name = String(raw.name ?? "tool");
          let args: Record<string, unknown> = {};
          try {
            args = typeof raw.arguments === "string" ? JSON.parse(raw.arguments) : ((raw.arguments as Record<string, unknown>) ?? {});
          } catch {}
          const id = String(raw.callId ?? raw.id ?? `${name}-${Object.keys(args).join("")}`);
          yield { t: "tool", id, name, label: toolLabel(name, args), status: "running" };
        } else if (ev.name === "tool_output") {
          const raw = (ev.item as { rawItem?: Record<string, unknown> })?.rawItem ?? {};
          const id = String(raw.callId ?? raw.call_id ?? raw.id ?? "");
          yield { t: "tool", id, status: "done" };
        }
      }
    }
    await stream.completed;
    const text = String(streamedText || stream.finalOutput || "");
    yield { t: "final", mutated: recorded.length > 0, docs: recorded.map((r) => r.docNo), text };
  } catch (e) {
    yield { t: "error", message: "AI 调用出错：" + errMsg(e) + "。可改用页面操作。" };
  }
}
