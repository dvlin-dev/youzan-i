import { z } from "zod";
import { stockMap, levelOf } from "@/lib/db/queries";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";
import { submitMove } from "@/lib/actions";
import { yuan } from "@/lib/money";
import { can, type Role } from "@/lib/constants";
import type { Sku } from "@/lib/db/schema";

// 仅取类型，避免 @openai/agents 在构建期被求值（运行时由 copilot 动态 import 后注入）。
type Agents = typeof import("@openai/agents");

export type RecordedMove = { docNo: string; summary: string };

export type ToolCtx = {
  role: Role;
  skus: Sku[];
  skuSet: Set<string>;
  /** record_move 把本轮生成的待复核单写进来，copilot 据此提示去审批。 */
  recorded: RecordedMove[];
};

/**
 * Agent 的全部类型化工具，集中一处定义/挂载。
 * 约定：只读工具人人可用；写工具（record_move）按 RBAC 挂载，且只生成待复核单——
 * 不在对话内二次确认（去掉了打断式 needsApproval），由「审核单」审批闸 + 入账守恒护栏兜底。
 *
 *   query_stock(styleNo,color,size)  只读：查某 SKU 当前库存
 *   low_stock()                      只读：列出低于安全库存（含断码）的 SKU
 *   recon_summary()                  只读：盘点对账第 1 层归因汇总（仅采购/老板）
 *   record_move(type,...,qty)        写：登记一笔入/出库 → 待复核单（仅仓管/老板；一轮可多次）
 */
export function createTools(agents: Agents, ctx: ToolCtx) {
  const { tool } = agents;
  const { role, skus, skuSet, recorded } = ctx;

  const queryStock = tool({
    name: "query_stock",
    description: "查某个 SKU 当前还有多少件库存。用户问『还剩多少 / 库存多少』时用。",
    parameters: z.object({
      styleNo: z.string().describe("款号，如 AW2024-3301"),
      color: z.string().describe("颜色，去掉多余的『色』字，如 藏青 / 黑 / 米白"),
      size: z.string().describe("尺码，取值 S / M / L / XL / 2XL"),
    }),
    execute: async ({ styleNo, color, size }) => {
      const key = `${styleNo}-${color}-${size}`;
      if (!skuSet.has(key)) return `系统里没有 ${key} 这个 SKU`;
      const sm = await stockMap();
      return `${key} 当前库存 ${sm[key] ?? 0} 件`;
    },
  });

  const lowStock = tool({
    name: "low_stock",
    description:
      "列出低于安全库存（含断码=0）的 SKU；要补货 / 问『哪些快断货』时先调它。" +
      "每条带齐 款号/颜色/尺码/当前库存/安全库存——这些就能直接喂给 record_move 补货，不必再向用户要色码。",
    parameters: z.object({}),
    execute: async () => {
      const sm = await stockMap();
      const low = skus.filter((s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) !== "ok");
      if (!low.length) return "库存健康，暂无低库存。";
      const lines = low.map(
        (s) => `· 款号 ${s.styleNo}｜颜色 ${s.color}｜尺码 ${s.size}（${s.styleName}）当前 ${sm[s.skuCode] ?? 0} 件 / 安全库存 ${s.safetyStock}`,
      );
      return `共 ${low.length} 个 SKU 低于安全库存（含断码），款号/颜色/尺码已给全，可直接据此补货：\n${lines.join("\n")}`;
    },
  });

  const reconSummary = tool({
    name: "recon_summary",
    description:
      "盘点对账汇总：盘亏毛额、AI 归因后的真损失/可追回、各成因分桶。用户问『对得上账吗 / 差多少 / 差在哪』时用。",
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

  const recordMove = tool({
    name: "record_move",
    description:
      "登记一笔入库(IN)或出库(OUT)，生成『待复核单』。审批后才入账，所以你可以直接登记、不必在对话里再让用户确认。" +
      "一轮里可多次调用，把多笔（如多个低库存 SKU 的补货）一并登记。",
    parameters: z.object({
      type: z.enum(["IN", "OUT"]).describe("IN=入库（加库存，如到货/补货），OUT=出库（减库存，如销售/调出）"),
      styleNo: z.string().describe("款号，如 AW2024-3301"),
      color: z.string().describe("颜色，去掉多余的『色』字，如 藏青 / 黑 / 米白"),
      size: z.string().describe("尺码，取值 S / M / L / XL / 2XL"),
      qty: z
        .number()
        .int()
        .positive()
        .describe("这一笔的件数（正整数）。补货到 N 件时填 N−当前库存（当前库存先用 low_stock / query_stock 查）"),
    }),
    execute: async ({ type, styleNo, color, size, qty }) => {
      const skuCode = `${styleNo}-${color}-${size}`;
      if (!skuSet.has(skuCode)) return `登记失败：系统里没有 ${skuCode} 这个 SKU，请核对款号/颜色/尺码`;
      const r = await submitMove({ type, entries: [{ skuCode, qty }] });
      const label = type === "IN" ? "入库" : "出库";
      if (r.ok && r.docNo) {
        recorded.push({ docNo: r.docNo, summary: `${label} ${skuCode} ${qty} 件` });
        return `已生成待复核单 ${r.docNo}（${label} ${skuCode} ${qty} 件），等待审批入账`;
      }
      return `登记失败：${r.msg}`;
    },
  });

  const tools = [queryStock, lowStock];
  if (can.recon(role)) tools.push(reconSummary);
  if (can.move(role)) tools.push(recordMove);
  return tools;
}
