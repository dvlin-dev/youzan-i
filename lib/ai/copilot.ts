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
  const agent = new Agent({
    name: "云链进销存助手",
    model: process.env.OPENAI_MODEL,
    instructions: `你是服装批发进销存系统「云链」的 AI 助手，当前用户角色是「${role}」。
用中文、简洁、口语化回答。可用商品目录（务必映射到真实存在的 款号/颜色/尺码）：
${cat}
规则：
- 出入库是写操作：**直接调用 record_move 生成待复核单**，不要在对话里请用户逐条确认（审批闸会兜底）；一句话涉及多笔就**多次调用** record_move，在这一轮里连续把它们都登记完。
- 颜色去掉多余的"色"字（如"藏青色"→"藏青"）；尺码用 S/M/L/XL/2XL。
- 信息不全（缺数量/款号/色码）时，直接追问澄清，绝不瞎猜、不凭空登记。
- 查库存、低库存、对账用对应只读工具。
- 本轮若登记了出入库，最后用一两句话总结这轮登记了哪几张单，并提示用户去「入库/出库 → 待复核」里审批；绝不口头声称"已入库/已出库/已审批"（它们还只是待复核）。`,
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
