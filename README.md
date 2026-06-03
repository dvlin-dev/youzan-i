# 云链进销存（jxc）

服装批发场景的 **AI-Native 进销存系统**：入库出库、库存预警、采购单、盘点对账。

> 客户原话痛点："8 个人用 Excel 记库存、上月盘点差了三万多。"
> 解法核心：把库存从"可被覆盖的数字"重构为**不可变流水累加出的派生值**（守恒不变量 + 待复核审批闸从结构上消灭错账）；让 AI 经类型化工具层成为系统的一等操作者——而它所需的安全地基，恰好就是治错账的那一套。

## 🚀 在线体验

**https://youzan.dvlin.com**

登录页已**预填演示账号**，选角色点「登录」即可：

| 角色 | 账号 | 能做什么 |
| --- | --- | --- |
| 仓管 | warehouse@demo.com / demo1234 | 只看库存（成本脱敏）+ 录出入库 |
| 采购 | buyer@demo.com / demo1234 | 采购单 + 盘点对账 |
| 老板 | admin@demo.com / demo1234 | 全局 + 盘点过账 |

**建议体验路径**：老板登录 → 「盘点对账」看 AI 把"差三万"两层归因拆成可执行的几摞 → 点任意差异行看流水链 + 证据 + 采纳建议 → 右上「AI 助手」用一句话连续出入库 / 查库存（AI 一轮可多步，直接生成待复核单 → 去「入库/出库 → 待复核」审批）。

## 技术栈

Next.js 16（App Router / RSC / Server Actions）· React 19 · TypeScript · **Drizzle ORM + Neon Postgres** · Auth.js v5 · Tailwind v4（响应式，移动端抽屉导航）· **@openai/agents**（gpt-5.5，经 OpenAI 兼容网关）· Vitest（库存守恒不变量 + 归因检测器回归单测）。

## 本地运行

```bash
pnpm i
cp .env.example .env            # 填 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL / DATABASE_URL / AUTH_SECRET
pnpm db:push                    # 建表
pnpm db:seed                    # 灌入 79 SKU + 9 埋雷盘点 + 演示账号
pnpm dev                        # http://localhost:3000
```

验证基线：`pnpm test`（库存守恒 + 归因检测器回归）· `pnpm lint` · `pnpm typecheck` · `pnpm build`。

## 一键部署 Vercel

1. 连接本仓库到 Vercel（框架自动识别为 Next.js）。
2. 加 Postgres：`vercel integration add neon`（或在 Storage 里建 Neon，自动注入 `DATABASE_URL`）。
3. 配环境变量：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`AUTH_SECRET`（变量样例见 `.env.example`）。
4. 部署。构建命令 `drizzle-kit push --force && next build` 会自动建表；首次部署后 `pnpm db:seed` 灌数据。
5. （可选）启用 AI `query_sql` 只读查询：`pnpm tsx ... lib/db/setup-readonly.ts` 建两个只读角色，把输出的 `DATABASE_URL_READONLY` / `DATABASE_URL_READONLY_WH` 配进 Vercel。不配则 `query_sql` 自动停用，其余工具照常。
6. 无 `OPENAI_API_KEY` 时 AI 优雅降级（仅确定性检测器 + 模板话术），应用照常可用。

## 核心理念

- **库存 = 流水累加**（append-only ledger），守恒不变量 `I1/I2` 随时成立；纠错只能红冲、永久留痕。待复核草稿存于独立 `move_draft` 表，与不可变流水**物理隔离**——`stock_ledger` 只增不改不删；复核入账时经**原子守恒护栏**（落账后库存不为负才追加），杜绝并发出库打穿库存。
- **盘点对账**不是"找差异"，而是 **AI 两层归因**：第 1 层确定性检测器产出**权威**的分桶 / 金额 / 真损失判定（可复现）；第 2 层 LLM 按需对成因排序、给出可执行解释（基于第 1 层证据，不编造）。把"差三万"拆成：真损失该认、串色该互换、重复该红冲、可索赔该追——账面 −¥3.1 万 → 真实物净损失约 ¥1.2 万。
- **AI 不写裸 SQL 改库、不直接落库**：写操作只调经守恒 + 权限 + 审计的类型化工具（集中在 `lib/ai/tools.ts`），直接生成待复核单、由审批闸兜底；**只读**查询可经 `query_sql` 跑受控单条 SELECT——独立只读角色 DB 层物理拒写 + 字段脱敏（仓管连接的 `sku` 是去 cost_price 视图）+ 语句校验 + 审计。
- **权限在数据层生效**：接口 RBAC + 字段脱敏（成本价对仓管不出现），不是前端藏按钮；连 AI 自由查询也由 DB 只读角色/视图兜底。

## 代码结构

```text
app/(app)/{dashboard,stock,move,purchase,stocktake}   角色化页面
app/login · app/api/{auth,copilot}                    登录 · 鉴权 · AI 路由
lib/db/{schema,client,queries,ledger,draft,seed}      数据层（库存=流水派生；draft=待复核草稿区，与不可变 ledger 隔离）
lib/db/{readonly,setup-readonly}                      query_sql 连接层：按角色选只读角色（仓管走去 cost_price 脱敏视图）+ 建角色脚本
lib/tools 即 lib/actions.ts                           类型化工具层（Server Actions，RBAC + 守恒护栏 + 审计）
lib/stocktake/{attribution,engine}                    盘点归因（第 1 层确定性检测器，权威分桶/金额）
lib/ai/{client,copilot,tools,sql-guard,audit,explain} copilot（agent loop）+ tools（含 query_sql）+ sql-guard/audit + 第 2 层 LLM 归因
lib/stock-math.ts                                     库存守恒纯函数（可单测）
tests/*                                               Vitest（守恒不变量 + 归因检测器回归）
components/*                                          UI（暖色账册主题，token 化；响应式）
jxc-prototype.html                                    早期单文件原型（参考）
```

## 知识库（docs/）

设计与方法论文档见 [docs/](./docs/design/index.md)：[领域模型](./docs/design/domain-model.md) · [盘点对账与 AI 归因](./docs/design/stocktake-reconciliation.md) · [AI-Native 架构](./docs/design/ai-native-architecture.md) · [生产化计划](./docs/plan/2026-06-02-production-nextjs-vercel.md)。协作规范见 [CLAUDE.md](./CLAUDE.md)。
