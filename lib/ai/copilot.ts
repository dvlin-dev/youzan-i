import { z } from "zod";
import { allSkus, stockMap, levelOf } from "@/lib/db/queries";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";
import { yuan } from "@/lib/money";
import { can, type Role } from "@/lib/constants";

export function aiEnabled() {
  return !!process.env.OPENAI_API_KEY;
}

export type CopilotResult =
  | { kind: "text"; text: string }
  | { kind: "preview"; action: { type: "IN" | "OUT"; skuCode: string; qty: number }; note: string };

let configured = false;
// 动态加载，避免 @openai/agents 在构建期被求值（其 import 期初始化会让 next build 收集页面数据时崩溃）。
async function loadAgents() {
  const agents = await import("@openai/agents");
  if (!configured) {
    const OpenAI = (await import("openai")).default;
    agents.setDefaultOpenAIClient(
      new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL }),
    );
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
  const { Agent, run, tool } = agents;

  const skus = await allSkus();
  const skuSet = new Set(skus.map((s) => s.skuCode));

  const queryStock = tool({
    name: "query_stock",
    description: "查询某 SKU 的当前库存数量",
    parameters: z.object({ styleNo: z.string(), color: z.string(), size: z.string() }),
    execute: async ({ styleNo, color, size }) => {
      const key = `${styleNo}-${color}-${size}`;
      if (!skuSet.has(key)) return `系统里没有 ${key} 这个 SKU`;
      const sm = await stockMap();
      return `${key} 当前库存 ${sm[key] ?? 0} 件`;
    },
  });

  const lowStock = tool({
    name: "low_stock",
    description: "列出低于安全库存（含断码）的 SKU",
    parameters: z.object({}),
    execute: async () => {
      const sm = await stockMap();
      const low = skus.filter((s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) !== "ok");
      if (!low.length) return "库存健康，暂无低库存。";
      return (
        `共 ${low.length} 个 SKU 低于安全库存：\n` +
        low.slice(0, 8).map((s) => `· ${s.styleName} ${s.color}/${s.size} — ${sm[s.skuCode] ?? 0} 件`).join("\n")
      );
    },
  });

  const reconSummary = tool({
    name: "recon_summary",
    description: "盘点对账：账实差异的 AI 归因汇总（盘亏毛额、真损失、可追回、各成因分桶）",
    parameters: z.object({}),
    execute: async () => {
      const view = await loadStocktakeView();
      if (!view) return "暂无盘点单。";
      const s = summarize(view.rows);
      const names: Record<string, string> = {
        loss: "实物损耗·真损失",
        dup: "重复记账·账面虚高",
        supplier: "供应商少发·可索赔",
        misship: "疑错发·待核实",
        swap: "串色·货在",
        transit: "在途·假差异",
      };
      const lines = Object.entries(s.buckets).map(([b, v]) => `· ${names[b] ?? b}：${yuan(v!.val)}（${v!.n}项）`);
      return `盘亏毛额 ${yuan(s.loss)}（≈"差三万多"）；AI 归因后真实物净损失约 ${yuan(s.real)}、可追回 ${yuan(s.recover)}。\n${lines.join("\n")}`;
    },
  });

  const proposeMove = tool({
    name: "propose_move",
    description:
      "登记入库(IN)或出库(OUT)。务必从用户描述映射到目录里真实存在的 款号/颜色/尺码；这是写操作，会先生成预览交人工确认，不要假装已完成。",
    parameters: z.object({
      type: z.enum(["IN", "OUT"]),
      styleNo: z.string(),
      color: z.string(),
      size: z.string(),
      qty: z.number().int().positive(),
    }),
    needsApproval: true,
    execute: async () => "PENDING_HUMAN_APPROVAL",
  });

  const tools = [queryStock, lowStock];
  if (can.recon(role)) tools.push(reconSummary);
  if (can.move(role)) tools.push(proposeMove);

  const cat = await catalog();
  const agent = new Agent({
    name: "云链进销存助手",
    model: process.env.OPENAI_MODEL,
    instructions: `你是服装批发进销存系统「云链」的 AI 助手，当前用户角色是「${role}」。
用中文、简洁、口语化回答。可用商品目录（务必映射到真实存在的 款号/颜色/尺码）：
${cat}
规则：
- 出入库属于写操作，必须调用 propose_move 生成预览交人工确认；绝不口头声称"已入库/已出库"。
- 颜色去掉多余的"色"字（如"藏青色"→"藏青"）；尺码用 S/M/L/XL/2XL。
- 信息不全（缺数量/款号/色码）时，直接追问澄清，不要瞎猜。
- 查库存、低库存、对账用对应只读工具。`,
    tools,
  });

  try {
    const result = await run(agent, message);
    const interruptions = (result as { interruptions?: unknown[] }).interruptions ?? [];
    if (interruptions.length) {
      const it = interruptions[0] as {
        rawItem?: { name?: string; arguments?: unknown; function?: { arguments?: unknown } };
      };
      const raw = it.rawItem;
      const argsRaw = raw?.arguments ?? raw?.function?.arguments;
      const args = (typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw) as Record<string, unknown>;
      const type = args?.type === "OUT" ? "OUT" : "IN";
      const skuCode = `${args?.styleNo}-${args?.color}-${args?.size}`;
      const qty = Number(args?.qty);
      if (!skuSet.has(skuCode) || !Number.isFinite(qty) || qty <= 0)
        return { kind: "text", text: `没能确定要操作的 SKU（解析为 ${skuCode} × ${qty}）。请补全 款号 / 颜色 / 尺码 / 数量。` };
      return {
        kind: "preview",
        action: { type, skuCode, qty },
        note: "AI 不直接落库：确认后生成单据进入「待复核」，由他人复核才入账（typed 工具层 + HITL）。",
      };
    }
    return { kind: "text", text: result.finalOutput ?? "（无输出）" };
  } catch (e) {
    return { kind: "text", text: "AI 调用出错：" + (e instanceof Error ? e.message : String(e)) + "。可改用页面操作。" };
  }
}
