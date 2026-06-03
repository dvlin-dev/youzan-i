# 计划：只读 SQL 工具（query_sql）

> 状态：**已完成（2026-06-03）**。稳定事实已回写 [`design/ai-native-architecture.md`](../design/ai-native-architecture.md)（「只读 SQL 工具」一节）与 [`design/tech-stack.md`](../design/tech-stack.md)，`/docs` 已去「规划中」。本文仅保留落地决策与验证记录，不作第二事实源。

## 动机

当前 agent 工具集（`query_stock` / `low_stock` / `recon_summary` / `record_move`）覆盖高频场景，但面对临时、长尾的数据问题（“上个月卡其色卖了多少”“哪个供应商到货最慢”“某客户这季度出库 Top10”）需要逐个加工具。给 AI 一个**受控的只读 SQL 能力**，可一次性兜住灵活性，让 agent 的底层能力不被预置工具限制。

## 设计：灵活 + 安全（只读不写）

工具 `query_sql(sql: string)`，只接受**一条 SELECT**。安全靠纵深防御三层：

1. **语句层**：解析 / 校验只允许单条 `SELECT`；拒绝 `INSERT/UPDATE/DELETE/DDL`、多语句、注释绕过、写副作用函数。
2. **连接层（根本保证）**：用**只读数据库角色**执行——单独建一个仅 `GRANT SELECT` 的 Postgres role / 连接串，**即使语句层被绕过，DB 也物理拒写**。这是“只读”的硬保证，不依赖字符串解析。
3. **数据层**：沿用字段脱敏（成本价对仓管不出现）；加语句**超时 + 自动 LIMIT** 兜底，防重查询 / 拖库。

结果只读返回给 AI（再经其总结 / HITL），**不能写库、不能落文件**。仍属类型化工具层白名单（`lib/ai/tools.ts`），全程审计（记录原始 SQL + 发起人）。

## 验收（落地后补 Vitest / 手测）

- 喂写语句（`INSERT/UPDATE/DELETE/DROP`、多语句）→ 一律拒绝且不产生任何写。
- 用只读角色连接尝试写 → DB 报错（验证连接层兜底，不止靠解析）。
- 脱敏字段不因自由 SQL 而泄露（成本价等）。
- 正常 SELECT 能回答预置工具覆盖不到的长尾问题。

## 落地决策（与原计划的关键偏差）

原计划第 3 层「沿用字段脱敏」打算在**应用层**删 cost_price 列。落地时经对抗式红队（5 视角 + 综合）实测发现：**整行序列化绕过**——`to_jsonb(sku)` / `row_to_json(s)` / `array_to_json(array_agg(sku))` / `sku::text` 把成本价藏进非 `cost_price` 列名，既绕过 token 检查、又绕过按列名删除的输出脱敏，仓管越权读到成本价（critical）。

修复：把脱敏从应用层下沉到 **DB 层**，与「权限在数据层生效」对齐——建**两个**只读角色：
- `jxc_readonly`（采购/老板）：SELECT 业务表，无 `app_user`；
- `jxc_readonly_wh`（仓管）：`search_path` 把 `sku` 指向**去掉 cost_price 的视图**，且无采购单/盘点表权限。

于是成本价/受限表在仓管那条连接里 DB 层就不存在，整行序列化也带不出。其余红队发现一并修：`pg_stats` 统计目录（暴露列采样值）入语句层黑名单、`pg_sleep_for/_until` 补进危险函数、空 SQL 路径补审计、工具描述补全列。

落地文件：`lib/ai/sql-guard.ts`（语句+数据层校验）、`lib/db/readonly.ts`（连接层按角色选连接）、`lib/db/setup-readonly.ts`（建角色）、`lib/ai/audit.ts`（审计）、`lib/ai/tools.ts`（query_sql 注册）、`lib/ai/copilot.ts`/`app/api/copilot/route.ts`（透传发起人）。env：`DATABASE_URL_READONLY` / `DATABASE_URL_READONLY_WH`。

## 验证记录

- 单测：`tests/sql-guard.test.ts` 60 项绿（含拒写/多语句/注释绕过/危险函数/pg_stats/角色脱敏）。
- 连接层实测：只读角色对 UPDATE/INSERT/CREATE/DELETE 一律 “cannot execute … in a read-only transaction”；`readOnly` 事务再兜一层。
- 越权读实测：仓管 `to_jsonb(sku)`/`row_to_json`/`sku::text`/`SELECT *`/`(to_jsonb(sku))->'cost_price'` 均不含成本价；`pg_stats`/`pg_sleep_for` 被拒；采购/老板 cost_price 正常可见。
- 基线：`pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿。
- 待运维：把两条 `DATABASE_URL_READONLY*` 配到 Vercel 环境变量（本地 `.env.local` 已配）。
