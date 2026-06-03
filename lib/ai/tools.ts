import { z } from "zod";

import { submitMove } from "@/lib/actions";
import { auditSqlQuery } from "@/lib/ai/audit";
import { guardReadonlySql } from "@/lib/ai/sql-guard";
import { DEMO_MODE, type Role, can } from "@/lib/constants";
import { levelOf, stockMap } from "@/lib/db/queries";
import {
  READONLY_ROW_CAP,
  readonlyEnabled,
  runReadonlyQuery,
} from "@/lib/db/readonly";
import type { Sku } from "@/lib/db/schema";
import { yuan } from "@/lib/money";
import { loadStocktakeView, summarize } from "@/lib/stocktake/engine";

export type RecordedMove = { docNo: string; summary: string };

export type ToolCtx = {
  role: Role;
  skus: Sku[];
  skuSet: Set<string>;
  /** record_move 把本轮生成的待复核单写进来，copilot 据此提示去审批。 */
  recorded: RecordedMove[];
  /** 发起人：query_sql 等需要留痕「谁查的」。 */
  actor: { id: string; name: string };
};

/** 一个类型化工具：Zod 入参（→ JSON schema 给模型） + 服务端 execute（守恒/权限/审计在内部）。 */
export type ToolSpec = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * Agent 的全部类型化工具，集中一处定义。
 * 只读工具人人可用；写工具（record_move）按 RBAC 挂载，且只生成待复核单——
 * 由「审核单」审批闸 + 入账守恒护栏兜底，不在对话内二次确认。
 *
 *   query_stock(styleNo,color,size)  只读：查某 SKU 当前库存
 *   low_stock()                      只读：列出低于安全库存（含断码）的 SKU
 *   recon_summary()                  只读：盘点对账第 1 层归因汇总（仅采购/老板）
 *   record_move(type,...,qty)        写：登记一笔入/出库 → 待复核单（仅仓管/老板；一轮可多次）
 *   query_sql(sql)                   只读：跑一条受控 SELECT，兜住预置工具覆盖不到的长尾问题
 */
export function getToolSpecs(ctx: ToolCtx): ToolSpec[] {
  const { role, skus, skuSet, recorded, actor } = ctx;

  const specs: ToolSpec[] = [
    {
      name: "query_stock",
      description:
        "查某个 SKU 当前还有多少件库存。用户问『还剩多少 / 库存多少』时用。",
      schema: z.object({
        styleNo: z.string().describe("款号，如 AW2024-3301"),
        color: z
          .string()
          .describe("颜色，去掉多余的『色』字，如 藏青 / 黑 / 米白"),
        size: z.string().describe("尺码，取值 S / M / L / XL / 2XL"),
      }),
      execute: async (a) => {
        const key = `${a.styleNo}-${a.color}-${a.size}`;
        if (!skuSet.has(key)) return `系统里没有 ${key} 这个 SKU`;
        const sm = await stockMap();
        return `${key} 当前库存 ${sm[key] ?? 0} 件`;
      },
    },
    {
      name: "low_stock",
      description:
        "列出低于安全库存（含断码=0）的 SKU，每条带齐 款号/颜色/尺码/当前库存/安全库存。" +
        "用户问『哪些快断货 / 要补货 / 要补哪些』时用。",
      schema: z.object({}),
      execute: async () => {
        const sm = await stockMap();
        const low = skus.filter(
          (s) => levelOf(sm[s.skuCode] ?? 0, s.safetyStock) !== "ok",
        );
        if (!low.length) return "库存健康，暂无低库存。";
        return (
          `共 ${low.length} 个 SKU 低于安全库存（含断码），款号/颜色/尺码已给全：\n` +
          low
            .map(
              (s) =>
                `· 款号 ${s.styleNo}｜颜色 ${s.color}｜尺码 ${s.size}（${s.styleName}）当前 ${sm[s.skuCode] ?? 0} 件 / 安全库存 ${s.safetyStock}`,
            )
            .join("\n")
        );
      },
    },
  ];

  if (can.recon(role)) {
    specs.push({
      name: "recon_summary",
      description:
        "盘点对账汇总：盘亏毛额、AI 归因后的真损失/可追回、各成因分桶。用户问『对得上账吗 / 差多少 / 差在哪』时用。",
      schema: z.object({}),
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
        const lines = Object.entries(s.buckets).map(
          ([b, v]) => `· ${names[b] ?? b}：${yuan(v!.val)}（${v!.n}项）`,
        );
        const hint = DEMO_MODE ? '（≈"差三万多"）' : "";
        return `盘亏毛额 ${yuan(s.loss)}${hint}；AI 归因后真实物净损失约 ${yuan(s.real)}、可追回 ${yuan(s.recover)}。\n${lines.join("\n")}`;
      },
    });
  }

  if (can.move(role)) {
    specs.push({
      name: "record_move",
      description:
        "登记一笔入库(IN)或出库(OUT)，生成『待复核单』（审批后才入账）。" +
        "用户要『入/出/登记/补货 某 SKU N 件』时用；登记多笔就多次调用。",
      schema: z.object({
        type: z
          .enum(["IN", "OUT"])
          .describe(
            "IN=入库（加库存，如到货/补货），OUT=出库（减库存，如销售/调出）",
          ),
        styleNo: z.string().describe("款号，如 AW2024-3301"),
        color: z
          .string()
          .describe("颜色，去掉多余的『色』字，如 藏青 / 黑 / 米白"),
        size: z.string().describe("尺码，取值 S / M / L / XL / 2XL"),
        qty: z.coerce
          .number()
          .int()
          .positive()
          .describe("这一笔的件数（正整数，如 30）"),
      }),
      execute: async (a) => {
        const type = a.type === "OUT" ? "OUT" : "IN";
        const skuCode = `${a.styleNo}-${a.color}-${a.size}`;
        const qty = Number(a.qty);
        if (!skuSet.has(skuCode))
          return `登记失败：系统里没有 ${skuCode} 这个 SKU，请核对款号/颜色/尺码`;
        const r = await submitMove({ type, entries: [{ skuCode, qty }] });
        const label = type === "IN" ? "入库" : "出库";
        if (r.ok && r.docNo) {
          recorded.push({
            docNo: r.docNo,
            summary: `${label} ${skuCode} ${qty} 件`,
          });
          return `已生成待复核单 ${r.docNo}（${label} ${skuCode} ${qty} 件），等待审批入账`;
        }
        return `登记失败：${r.msg}`;
      },
    });
  }

  // query_sql：给 AI 一个「读任意数据」的兜底能力——只读不写，靠纵深防御三层。
  // 人人可挂载（按角色脱敏在 guard 内生效）；写/DDL 经语句层拒，只读角色经连接层物理拒写。
  specs.push({
    name: "query_sql",
    description:
      "只读 SQL：跑一条 SELECT 查任意数据，回答预置工具覆盖不到的长尾问题" +
      "（如『上月卡其色卖了多少』『哪个供应商到货最慢』『某客户本季出库 Top10』）。" +
      "只读不写——只能单条 SELECT/WITH，写/DDL/多语句/注释一律被拒。先试 query_stock/low_stock/recon_summary，它们答不了再用它。\n" +
      "可用表（金额均为整数分，展示时 /100；operator_id/reviewer_id/counter 存的是人名）：\n" +
      "· sku(sku_code, style_no, style_name, category, color, size, cost_price, tag_price, safety_stock, barcode)\n" +
      "· stock_ledger(id, sku_code, delta, biz_type, doc_no, ts, operator_id, reviewer_id, status, scanned, qc, po_ref, pd_adjust) —— 库存 = SUM(delta) WHERE status='posted'\n" +
      "· move_draft(doc_no, sku_code, delta, biz_type, operator_id, po_ref, qc, scanned, created_at) —— 待复核草稿\n" +
      "· purchase_order(po_no, supplier, status, created_by, eta, created_at) / po_line(po_no, sku_code, ordered, received, price)\n" +
      "· stocktake(pd_no, scope, status, snap_ts, counter, created_by, counted_at) / stocktake_count(pd_no, sku_code, book_snapshot, actual, resolved)\n" +
      "部分表/列按角色限制（如成本价 cost_price、采购单、盘点对仓管不可见）、用户表与统计目录人人不可读，被拒时换个查法即可。",
    schema: z.object({
      sql: z
        .string()
        .describe(
          "一条只读 SELECT 语句，可含 WITH/JOIN/GROUP BY/ORDER BY/LIMIT。不要写分号分隔的多条语句，不要写注释。",
        ),
    }),
    execute: async (a) => {
      const raw = String(a.sql ?? "");
      // 绑定发起人/角色的审计闭包：留痕字段（谁查的）只写一处，杜绝新增分支漏记或拼错。
      const audit = (
        rest: Omit<
          Parameters<typeof auditSqlQuery>[0],
          "actorId" | "actorName" | "role"
        >,
      ) =>
        auditSqlQuery({
          actorId: actor.id,
          actorName: actor.name,
          role,
          ...rest,
        });

      if (!readonlyEnabled(role)) {
        audit({ sql: raw, outcome: "disabled" });
        return "只读 SQL 暂不可用：系统未配置只读数据库角色（DATABASE_URL_READONLY）。请改用其它工具，或让管理员开启。";
      }
      const guard = guardReadonlySql(raw, role);
      if (!guard.ok) {
        audit({ sql: raw, outcome: "rejected", reason: guard.reason });
        return `已拒绝该 SQL：${guard.reason}`;
      }
      try {
        const { rows, truncated } = await runReadonlyQuery(guard.sql, role);
        const safe = maskOutputColumns(rows, role);
        audit({ sql: guard.sql, outcome: "ok", rowCount: safe.length });
        return formatRows(safe, truncated);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        audit({ sql: guard.sql, outcome: "error", reason: msg });
        const hint = /more than once|duplicate/i.test(msg)
          ? "（多列同名，请用 AS 给列取别名）"
          : "";
        return `查询执行失败：${msg}${hint}`;
      }
    },
  });

  return specs;
}

/** 当前角色不可出现在结果里的列：堵住 `SELECT *` 把受限列带出的口子（guard 只挡显式列名）。 */
function deniedOutputColumns(role: Role): string[] {
  const base = ["password_hash"];
  return role === "warehouse" ? [...base, "cost_price"] : base;
}

/** 输出列脱敏——与 actions.ts 的 maskCost 同源：成本价对仓管不进响应体，哪怕来自 SELECT *。 */
function maskOutputColumns(
  rows: Record<string, unknown>[],
  role: Role,
): Record<string, unknown>[] {
  const denied = deniedOutputColumns(role);
  if (!rows.length || !denied.some((c) => c in rows[0])) return rows;
  return rows.map((r) => {
    const copy = { ...r };
    for (const c of denied) delete copy[c];
    return copy;
  });
}

/** 输出体量预算：防 repeat()/聚合把单元格放大成超大值（行上限只按行计、不按字节计）。 */
const OUT_TOTAL_CAP = 8000; // 总字节预算
const OUT_ROW_CAP = 2000; // 单行序列化上限——逐行物化时设界，不对全量行一次性 stringify

/** 把只读查询结果整理成模型易读的紧凑文本：表头 + JSON 行，逐行按字节预算截断（防超大单元格）。 */
function formatRows(
  rows: Record<string, unknown>[],
  truncated: boolean,
): string {
  if (rows.length === 0) return "查询成功：0 行。";
  const cols = Object.keys(rows[0]);
  const parts: string[] = [];
  let used = 0;
  let shown = 0;
  let clipped = false;
  for (const r of rows) {
    let s = JSON.stringify(r);
    if (s.length > OUT_ROW_CAP) {
      s = s.slice(0, OUT_ROW_CAP) + "…";
      clipped = true;
    }
    if (used + s.length > OUT_TOTAL_CAP) {
      clipped = true;
      break;
    }
    parts.push(s);
    used += s.length;
    shown++;
  }
  const head = `查询成功：${rows.length} 行${truncated ? `（已截断到前 ${READONLY_ROW_CAP} 行）` : ""}｜列：${cols.join(", ")}`;
  const note =
    shown < rows.length || clipped
      ? `\n（仅展示前 ${shown} 行 / 已按体量截断，请缩小范围或加聚合）`
      : "";
  return `${head}\n[${parts.join(",")}]${note}`;
}
