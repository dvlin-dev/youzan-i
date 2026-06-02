# 生产化计划：原型 → Next.js + Postgres + Vercel 一键部署

> 状态：进行中（计划）。目标把 `jxc-prototype.html` 升级为生产级全栈应用，带后端数据库，可一键部署 Vercel。
> 规范事实见 `../design/`，工程规范见 `../reference/engineering-standards.md`；本计划完成后把稳定事实回写过去。

## 1. 目标与验收

- 真后端 + Postgres 持久化；库存为流水派生、守恒不变量在 DB + 工具层双重保证。
- 三角色鉴权、权限数据层生效。
- 出入库 / 采购单状态机 / 盘点对账（含两层 AI 归因闭环）/ AI copilot 全部可用。
- **一键部署 Vercel**：README 的 Deploy 按钮 → 配 3 个环境变量 → 自动建表 + 灌 seed → 可登录演示。
- RC-01..09 + AI 发布红线全绿（见 `../reference/evaluation-rubric.md`）。

## 2. 技术栈（定档）

Next.js 15（App Router / RSC / Server Actions）· React 19 · TypeScript strict · Drizzle ORM · **Vercel Postgres（Neon）** · Auth.js v5 · Tailwind + shadcn/ui · Zod · **@openai/agents（OpenAI Agents SDK）** · Vitest + Playwright · pnpm。理由见 `../reference/engineering-standards.md`。

> AI 运行时经 OpenAI 兼容网关接入：`setDefaultOpenAIClient(new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_BASE_URL }))` + `setOpenAIAPI('chat_completions')`，模型名取 `OPENAI_MODEL`。

## 3. 数据库 schema（Drizzle / Postgres）

落地 `../design/domain-model.md` 的实体：

```text
app_user(id, name, role)
sku(sku_code PK, style_no, style_name, category, color, size,
    cost_price_cents, tag_price_cents, safety_stock, barcode)
stock_ledger(id PK, sku_code FK, delta int, biz_type, doc_no, ts,
    operator_id, reviewer_id?, status['pending'|'posted'],
    scanned bool, qc bool?, po_ref?, reversed_by?, created_at)        -- append-only
purchase_order(po_no PK, supplier, status, created_by, eta, created_at)
po_line(id PK, po_no FK, sku_code, ordered, received, price_cents)
stocktake(pd_no PK, scope, status['待复核'|'已过账'], snap_ts,
    counter, created_by, counted_at)
stocktake_count(id PK, pd_no FK, sku_code, book_snapshot, actual)
```

**库存派生**：`SELECT sku_code, SUM(delta) FROM stock_ledger WHERE status='posted' GROUP BY sku_code`（按 SKU 取数；可加物化视图 `stock_view` + 触发器刷新做性能优化）。
**不可变性**：迁移里对 `stock_ledger` 只授 INSERT；UPDATE/DELETE 用 DB 角色权限或行级策略禁掉，纠错走红冲行。
**守恒巡检**：`assertStockConserved()` 定时 + CI 跑（RC-08）。

## 4. 类型化工具层（lib/tools/*）

每个工具 = Zod schema + 守恒 + RBAC + 审计 + 生成待复核流水。UI 的 Server Action 与 AI copilot **复用同一层**：

```text
queryStock(filter, role)          只读，按角色脱敏 cost
appendLedger({sku,delta,bizType}) 守恒 + 不为负 → pending 流水
reviewDoc(docNo, reviewer)        reviewer ≠ creator → posted
createPo / receivePo              采购单状态机 + 到货回写 + 入库流水
attributeDiff(pdNo, sku)          两层归因（见 §6）
postStocktake(pdNo, keys)         追加盘盈/盘亏流水（pending）
```

## 5. AI Copilot（lib/ai + app/api/copilot）

NL → `Agent.run()`（tools = §4 白名单 `tool()`）→ 写工具 `needsApproval` 命中产生 **interruption**（= 结构化工具调用预览，不落库）→ `state.approve` 确认 → `appendLedger` 进待复核 → 双人复核入账。全程审计（含原始自然语言）。提示注入防御用 `inputGuardrails`：用户内容与指令分离、Agent 输出只能映射白名单工具、危险动作 `needsApproval` 必经 HITL。

## 6. 盘点对账 + 两层归因（lib/stocktake）

把原型 `attribute()` 逻辑迁为服务端：

- **第 1 层 确定性检测器**（纯 TS，不调模型）：串色 / 重复 / 单位倍数 / 供应商少发 / 高风险录入 / 时点错位。可单测、可回归（AI 红线）。
- **第 2 层 Agent 归因**：用 `@openai/agents` 的 Agent（`outputType` = Zod 的排序假设），把第 1 层命中 + 流水链喂进去，产出带证据 + 置信度的排序假设 + 修复建议；执行交给人。
- 闭环：发起（快照）→ 盲盘录入 → 算差异 → 归因 → HITL 过账记流水 → 库存派生归零。详见 `../design/stocktake-reconciliation.md`。

## 7. 里程碑

| M | 内容 | 关键产出 |
| --- | --- | --- |
| **M0** 脚手架 + 部署骨架 | Next.js + Drizzle + Neon 接好，空应用先能一键上 Vercel | `vercel.json`、env、Deploy 按钮、CI |
| **M1** 数据与不变量 | schema + 迁移 + seed（200 SKU + 9 埋雷）+ 库存派生 + 守恒断言 | `lib/db/*`、RC-08 |
| **M2** 鉴权 + 出入库 + 复核 | Auth.js 三角色（登录页预填演示账号、点击即登）+ RBAC + SKU 矩阵 + 双人复核 | RC-01/02/03/06/07/09 |
| **M3** 采购单 | 状态机 + 收货回写入库 | RC-04/05 |
| **M4** 盘点对账 + 归因 | 闭环 + 两层归因（第 2 层接 @openai/agents Agent） | AI 红线（归因/诚实兜底） |
| **M5** AI Copilot | NL → 工具预览 → HITL → 入账 | AI 红线（越权/注入/守恒） |
| **M6** 打磨 + 评测 + 部署文档 | 主题化 UI、三态、演示数据重置入口、评分卡过线、README 部署指引 | 全绿、可演示 |

## 8. 一键部署 Vercel

- `vercel.json` + Deploy Button（README）。环境变量：`DATABASE_URL`（Vercel Postgres 自动注入）、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`AUTH_SECRET`。变量样例见仓库根 `.env.example`。
- 构建流程：`pnpm build`；首次部署后 `pnpm db:push && pnpm db:seed`（或用 Vercel build hook / postinstall 守护幂等执行）。
- 演示账号随 seed 落库：仓管 / 采购 / 老板，落地页一键切换。
- 无 `OPENAI_API_KEY` 时：第 2 层归因与 copilot 降级为"仅确定性检测器 + 模板话术"，应用仍可完整演示（优雅降级）。

## 9. 原型 → 生产 映射

| 原型（jxc-prototype.html） | 生产 |
| --- | --- |
| `LEDGER` 数组 + `stockOf()` | `stock_ledger` 表 + 派生查询 |
| `STOCKTAKE` + `attribute()` | `stocktake*` 表 + `lib/stocktake`（第 2 层接 @openai/agents Agent） |
| `pendingDocs` / `reviewDoc` | `status` 字段 + `reviewDoc` 工具 |
| copilot `parseIntent` + 预览 | `@openai/agents` run() + interruption 工具调用预览组件 |
| 角色 `can.*` 前端判断 | 数据层 RBAC + 字段脱敏 |
| 内置 mock | `db/seed.ts` |

## 10. 范围决策（已定 2026-06-02）

- **ORM：Drizzle** ✅
- **鉴权：Auth.js v5** ✅（credentials，3 个 seed 账号，RBAC 在数据层生效）。**完整真实登录流程**（不做免登录跳过，保证鉴权逻辑闭环）；但**登录页默认预填账号 + 密码**——按角色切换即自动填充对应演示账号，用户点"登录"即可、无需手输。
- **演示数据重置：要** ✅（老板可一键重灌 9 埋雷盘点 + 库存；admin-only `/reset-demo`，幂等）。
- **多模态录入、语义搜索：本期不做** ✅（架构保留能力位，见 `../design/ai-native-architecture.md` 能力 ②③，不进 M0–M6）
- 本期 AI 范围：对账两层归因（M4）+ NL→动作 copilot（M5，纯文本）+ 补货建议起草。
- 模型：`gpt-5.5`（经 `OPENAI_BASE_URL` 网关，`chat_completions` API）。
