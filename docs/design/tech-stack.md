# 技术栈与代码结构

> 规范事实源：生产实现的选型、代码目录 / 模块职责、以及核心不变量"落到哪段代码"。
> 不变量的**定义**以 [domain-model.md](./domain-model.md) 与根 `CLAUDE.md` 为准；本文件给"架构落地"视图。可复用的编码/协作规范见 [../reference/coding-conventions.md](../reference/coding-conventions.md)。

## 技术栈（生产）

| 关注 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | **Next.js 16**（App Router、RSC、Server Actions、Turbopack）+ React 19 | 全栈一体；Server Actions 天然做"类型化工具层"；Vercel 一键部署 |
| 语言 | **TypeScript**（strict） | 类型即契约 |
| 数据库 | **Neon serverless Postgres** | 随 Vercel 一键开通，serverless 友好 |
| ORM | **Drizzle** | SQL-first、serverless 友好；库存派生 `SUM(delta)` 自然，迁移可控 |
| 校验 | **Zod**（v4） | 工具 / 表单入参 schema = typed tools 的类型边界；`z.toJSONSchema()` 直接喂给模型 |
| 样式 | **Tailwind v4（CSS-first）+ 设计 token** | 复刻原型"暖色账册"主题，避开通用 AI 审美（自写组件 CSS，不引 UI 套件） |
| AI 运行时 | **OpenAI 兼容网关**（`OPENAI_BASE_URL`，Chat Completions，model `gpt-5.5`，`reasoning_effort=medium`） | 第三方网关接模型 |
| AI 编排 | copilot 在 `lib/ai/copilot.ts` **手写流式 + 工具循环**直接驱动 OpenAI 客户端（实时下发 思考 / 工具 / 回答）；工具集中在 `lib/ai/tools.ts`（typed `ToolSpec`，内含 RBAC + 守恒 + 审计） | 网关把思考放在 `reasoning_content`、SDK 流不暴露，故未用 `@openai/agents` 的 run() 流；详见 [ai-native-architecture.md](./ai-native-architecture.md) |
| AI 回复渲染 | **Streamdown** | 流式安全的 Markdown 渲染（容忍未闭合 token） |
| 鉴权 | **Auth.js v5**（credentials，三个 seed 角色） | 演示用，RBAC 落到数据层 |
| 测试 | **Vitest**（单元 / 守恒不变量 / 归因检测器回归） | 守恒与归因必须可回归 |
| 包管理 / 部署 | **pnpm** / **Vercel**（GitHub 自动部署） | — |

## 目录与模块职责

```text
app/(app)/{dashboard,stock,move,purchase,stocktake}   角色化页面（RSC）
app/login · app/api/{auth,copilot}                    登录 · 鉴权 · AI 流式接口（NDJSON）
lib/db/schema.ts        Drizzle 表（含 stock_ledger 不可变流水 + move_draft 待复核草稿）
lib/db/ledger.ts        append-only：唯一写库存入口 = 追加 posted 流水（无 update/delete）
lib/db/draft.ts         待复核草稿区 + postDraftAtomic（单条原子语句守恒过账）
lib/db/queries.ts       派生库存（SUM(delta)）、快照、报表查询
lib/db/seed.ts          演示数据（79 SKU + 9 埋雷盘点）
lib/actions.ts          类型化工具层（"use server"）：submitMove / reviewDoc / receivePO / … RBAC+守恒+审计
lib/ai/tools.ts         Agent 工具注册表 getToolSpecs：query_stock / low_stock / recon_summary / record_move
lib/ai/copilot.ts       copilot 编排（手写流式 + 工具循环）
lib/ai/explain.ts       盘点第 2 层 LLM 归因解释（按需触发、降级安全）
lib/ai/client.ts        共享 OpenAI 客户端（经兼容网关）
lib/stocktake/{attribution,engine}   盘点第 1 层确定性检测器（权威分桶 / 金额）
lib/stock-math.ts       库存守恒纯函数（可单测）
lib/money.ts            整数分 helper
components/*             UI（token 化，消费设计变量）
tests/*                 Vitest（守恒不变量 + 归因检测器回归）
```

## 核心不变量 → 代码落地

> 不变量定义见 [domain-model.md](./domain-model.md)；下表给"在哪段代码被强制"。

| 不变量 | 强制点 / 文件 |
| --- | --- |
| 库存 = SUM(delta)，无直写 | `lib/db/queries.ts#stockMap`（不存在 `UPDATE stock.qty` 入口） |
| 流水 append-only（只 INSERT） | `lib/db/ledger.ts#insertRows`；待复核草稿隔离在 `lib/db/draft.ts` 的 `move_draft` |
| 出库不为负 + 并发不打穿 | `lib/db/draft.ts#postDraftAtomic`（单条 SQL 校验落账后 ≥ 0 才追加） |
| 改库需审批入账（单人即可） | `lib/actions.ts#reviewDoc`（草稿 → posted）；`submitMove / receivePO` 只生成草稿 |
| 金额整数分 | 全程 `cents`；展示 `lib/money.ts#yuan` |
| RBAC + 字段脱敏在数据层 | `lib/constants.ts#can`；`lib/actions.ts#fetchLedger` 的 `maskCost`（成本不进响应体） |
| AI 不写裸 SQL / 不直接落库 | 只能调 `lib/ai/tools.ts` 白名单工具；写操作走审批闸 |
| 盘点第 1 层权威、第 2 层只解释 | `lib/stocktake/attribution.ts`（分桶 / 金额）；`lib/ai/explain.ts`（排序解释，不改结论） |
