import { allSkus } from "@/lib/db/queries";
import { type Role } from "@/lib/constants";
import { aiEnabled, getOpenAIClient } from "./client";
import { createTools, type RecordedMove } from "./tools";

export { aiEnabled };

export type CopilotResult = {
  kind: "text";
  text: string;
  /** 本轮是否产生了写操作（出入库待复核单），前端据此刷新 + 提示去审批。 */
  mutated?: boolean;
  docs?: string[];
};

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

export async function runCopilot(message: string, role: Role): Promise<CopilotResult> {
  if (!aiEnabled())
    return {
      kind: "text",
      text: "AI 助手未配置（缺少 OPENAI_API_KEY）。当前为降级模式：请直接用页面上的「录入出入库 / 盘点对账」操作。",
    };

  let agents: Awaited<ReturnType<typeof loadAgents>>;
  try {
    agents = await loadAgents();
  } catch (e) {
    return { kind: "text", text: "AI 模块加载失败：" + (e instanceof Error ? e.message : String(e)) };
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
    modelSettings: { reasoning: { effort } },
    instructions: `你是服装批发进销存系统「云链」的 AI 助手，当前用户角色是「${role}」。
用中文、简洁、口语化。可用商品目录（务必映射到真实存在的 款号/颜色/尺码）：
${cat}

【工作方式】
- 你可以在一轮里连续调用多个工具，把用户要做的事一次办完（agent loop），不要做一件就停下来问。
- **能做就做**：当意图明确、且所需信息你已经拿得到（来自工具结果、上文对话、或上面的目录），就**直接调用工具执行**，不要把已经知道的信息再回头问用户。
- 只有在真正缺关键信息、且无法自行推断时才追问（例如用户完全没给数量/目标，或所指 SKU 不存在）。绝不编造不存在的 SKU，也不凭空捏造数量。

【出入库 / 补货（写操作）】
- 直接调用 record_move 生成待复核单（不必在对话里二次确认，审批闸兜底）；多笔就多次调用，一轮内全部办完。
- record_move 的 qty 是这次出/入的件数。"补货到 N 件" = 入库 (N − 当前库存)；当前库存从 low_stock / query_stock 拿；若当前已 ≥ N 就跳过该 SKU 并说明。
- 用户说"把这些 / 快断货的都补到 N"时，指的就是你刚用 low_stock 查出的那批 SKU——**直接对它们逐个 record_move**，low_stock 已给全款号/颜色/尺码，不要再要一遍。
- 颜色去掉多余的"色"字（藏青色→藏青）；尺码用 S/M/L/XL/2XL。

【只读】查库存、低库存、对账用对应只读工具。

【收尾】本轮若登记了出入库，用一两句话列出登记了哪几张待复核单，并提示去「入库/出库 → 待复核」审批；绝不声称"已入库/已出库/已审批"（它们还只是待复核）。`,
    tools,
  });

  try {
    const result = await run(agent, message);
    let text = result.finalOutput ?? "";
    if (recorded.length && !text)
      text = `本轮已登记 ${recorded.length} 张待复核单：\n` + recorded.map((r) => `· ${r.summary}（${r.docNo}）`).join("\n") + "\n请到「入库/出库 → 待复核」审批入账。";
    return {
      kind: "text",
      text: text || "（无输出）",
      mutated: recorded.length > 0,
      docs: recorded.map((r) => r.docNo),
    };
  } catch (e) {
    return { kind: "text", text: "AI 调用出错：" + (e instanceof Error ? e.message : String(e)) + "。可改用页面操作。" };
  }
}
