# 工程规范

> 长期工程规则：技术栈、目录、编码约束、测试。生产代码以此为准；与 `../design/` 的不变量一致。

## 技术栈（生产）

| 关注 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | **Next.js 15**（App Router、RSC、Server Actions）+ React 19 | 全栈一体，Server Actions 天然做"类型化工具层"，Vercel 一键部署 |
| 语言 | **TypeScript**（strict） | 类型即契约 |
| 数据库 | **Postgres**：Vercel Postgres / Neon serverless | 一键随 Vercel 开通，serverless 友好 |
| ORM | **Drizzle** | SQL-first、serverless 友好；库存派生用 `SUM(delta)` 很自然，迁移可控 |
| 校验 | **Zod** | 工具 / 表单输入 schema，即"typed tools"的类型边界 |
| 样式 | **Tailwind CSS + shadcn/ui** + 设计 token | 复刻原型"暖色账册"主题，避开通用 AI 审美 |
| AI | **@openai/agents**（OpenAI Agents SDK，TS） | `tool()`=工具层（集中在 `lib/ai/tools.ts`）、待复核审批闸=HITL、guardrails=注入/越权防御、Agent loop=copilot（一轮多步）；经 OpenAI 兼容网关（`OPENAI_BASE_URL`）接模型，`chat_completions` API |
| 鉴权 | **Auth.js v5**（credentials，三个 seed 角色） | 演示用，RBAC 落到数据层 |
| 测试 | **Vitest**（单元 / 不变量 / 归因检测器）+ **Playwright**（e2e） | 守恒与归因必须可回归 |
| 包管理 / 部署 | **pnpm** / **Vercel** | — |

## 目录约定

```text
app/                  路由 + Server Actions（写操作入口）
  api/copilot/        AI 助手流式接口
components/           UI（token 化，消费设计变量）
lib/
  db/schema.ts        Drizzle 表定义（领域模型事实源映射）
  db/ledger.ts        append-only 流水：append / 红冲，无 update/delete
  db/queries.ts       派生库存、快照、报表查询
  tools/              类型化工具层（Zod schema + 守恒 + RBAC + 审计）
  stocktake/          盘点归因引擎（确定性检测器 + @openai/agents 第 2 层）
  ai/                 copilot 编排（NL → 工具调用预览 → HITL）
  money.ts            整数分 helper
tests/                vitest + playwright（含 RC-01..09）
```

## 编码约束（硬，对照 CLAUDE.md）

- **金额整数分**：统一 `cents`，仅展示层 `/100`；合计 = 逐单求和、逐分对齐。
- **流水 append-only**：DB 不授予 `stock_ledger` 的 UPDATE / DELETE；纠错只追加红冲行（`reversed_by` 串链）。
- **库存永远派生**：`SUM(delta) WHERE status='posted'`，无直写库存字段、无 `UPDATE stock.qty`。
- **写操作走 Server Action / typed tool**：内部强制守恒（出库不为负）+ RBAC + 审计 + 生成待复核草稿（`move_draft`，与不可变 ledger 物理隔离）。
- **审批入账闸**：操作先进待复核，任意人审批后才入账（单人即可，审批人可与录入人相同）；入账由 `postDraftAtomic` 在单条原子语句里校验落账后库存不为负——并发出库也打不穿。
- **AI 只能调白名单工具**（集中在 `lib/ai/tools.ts`），输入过 Zod；不写裸 SQL、不直接落库；写操作直接生成待复核单（不在对话内逐条确认），一轮可多步（agent loop），由审批闸兜底。
- **RBAC 在数据层**：接口校验角色，序列化层脱敏敏感字段（响应不含 `cost_price` 键）。
- **错误处理**：可预期错误返回结构化结果（不靠抛异常做流程控制）；不变量违例 → 告警 + 阻断。
- **命名**：文件小写中划线，变量 camelCase，类型 PascalCase。

## Git / 协作

- 中文沟通；未经授权不 `git commit` / `git push` / `git tag`。
- 改动任何"动库存"路径，提交前对照 CLAUDE.md《硬约束》逐条自检。

## 验证基线

```bash
pnpm tsc:check && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

库存守恒（I1/I2）与 6 类归因检测器必须有单测常驻；UI 变更跑 e2e + 浏览器人工确认关键界面。
