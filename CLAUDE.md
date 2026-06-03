# 云链进销存（jxc）

> 仓库级协作入口。只记录稳定上下文、目录职责、关键边界和执行规则；细节见 `docs/`。

## 项目概述

服装批发场景的**进销存系统**：入库出库、库存预警、采购单、对账盘点。客户原话痛点——"8 个人用 Excel 记库存、上月盘点差了三万多"。

核心立意：把库存从"可被覆盖的数字"重构为**由不可变流水累加出的派生值**，用一组守恒不变量 + 审批闸从结构上消灭错账；并走向 **AI-Native**——AI 经类型化工具层成为系统的一等操作者，而它所需的安全地基（不可变流水 + 库存守恒 + 待复核审批），恰好就是为治"盘点差三万"已经建好的那一套。

当前状态：

- **原型**：`jxc-prototype.html`——单文件、零依赖、可离线打开的高保真原型（5 个页面 + AI 助手侧栏 + 盘点对账两层归因闭环）。作为生产版的参考实现。
- **生产化**：目标是 Next.js 全栈 + Postgres、一键部署 Vercel；计划见 `docs/plan/`，尚未开工。

## 核心架构边界（事实源）

| 关注点 | 规范事实源 | 生产代码（规划） |
| --- | --- | --- |
| 领域模型 / 不变量 | `docs/design/domain-model.md` | `lib/db/schema.ts`、`lib/db/ledger.ts`、`lib/db/draft.ts`、`lib/stock-math.ts` |
| 盘点对账 / AI 归因 | `docs/design/stocktake-reconciliation.md` | `lib/stocktake/*`（第 1 层）、`lib/ai/explain.ts`（第 2 层） |
| AI-Native 架构 / 工具层 | `docs/design/ai-native-architecture.md` | `lib/actions.ts`、`lib/ai/*`、`app/api/copilot/*` |
| 交互与体验 | `docs/design/ux-principles.md` | `app/*`、`components/*` |
| 技术栈 / 代码结构 | `docs/design/tech-stack.md` | 生产代码全树 + 不变量落地映射 |
| 编码 / 协作规范 | `docs/reference/coding-conventions.md` | — |
| 评测 / 回归 | `docs/reference/evaluation-rubric.md` | `tests/*` |
| 参考实现（原型） | `jxc-prototype.html` | 将被 Next.js 版替换 |

## 硬约束（不可妥协）

- **库存不可直接编辑**，只能追加流水；库存 = `SUM(ledger.delta)` 派生，没有 `UPDATE stock.qty` 入口。
- **流水只增不改不删**（`stock_ledger` 只有 INSERT）；纠错用红冲（追加反向流水），原始错误永久留痕。**待复核草稿存于独立 `move_draft` 表**（可改可删、驳回即删），与不可变流水物理隔离，复核通过才作为 posted 行追加进 ledger。
- 守恒不变量随时成立：`I1 期初 + 入库 − 出库 = 期末`、`I2 库存 = 流水累加`。复核入账经**原子守恒护栏**（`postDraftAtomic`：单条语句内校验落账后库存不为负才追加），杜绝并发出库打穿库存。
- **改变库存的动作需经审批入账**：操作先生成待复核单（不直接落库），**任意人**审批后才入账（单人即可，审批人可与录入人相同；后端强校验单据存在性）；入账走 `postDraftAtomic` 守恒护栏（库存不为负）。
- **金额一律整数分**存储与计算，仅展示层 `/100`。
- **AI 不写裸 SQL、不直接落库**：只能调经守恒 + 权限 + 审计校验的类型化工具（集中在 `lib/ai/tools.ts`）；写操作**直接生成待复核单**（不在对话内逐条确认），一轮可连续多步（agent loop），结束时汇报本轮操作并提示去审批；审批闸 + 守恒护栏兜底。盘点第 2 层 LLM 归因（`lib/ai/explain.ts`）只读、只在第 1 层证据上排序解释，不改分桶/金额。
- **权限在数据层生效**：接口级 RBAC + 字段脱敏（成本价对仓管不在响应体出现，`fetchLedger` 按角色 `maskCost`），不是前端藏按钮。
- **实盘不进状态**：实盘是盘点的一次性校准输入，其长期痕迹是它生成的盘盈/盘亏流水。

## 文档路由

| 目录 | 职责 |
| --- | --- |
| `docs/design/` | 已确认的架构、数据模型、能力边界——长期维护的**规范事实源** |
| `docs/plan/` | 当前需求的执行计划、任务清单、验证记录 |
| `docs/reference/` | 长期工程规范、评分卡、AI 交付方法论 |

新需求默认先写 `docs/plan/`；被采纳的稳定事实回写 `docs/design/` 或 `docs/reference/`，**同一主题只保留一个事实源**。

## 工作规则

- 对话使用中文。
- 不经用户明确授权，不执行 `git commit` / `git push` / `git tag`。
- 先读现状再改，优先复用已有类型、工具与 helper。
- 代码要求最佳实践、模块化、单一职责，但不为当前体量过度设计。
- 任何"改变库存"的代码路径，提交前对照上面《硬约束》逐条自检。
- 界面 / 交互变更须对齐 `docs/design/ux-principles.md`。

## 验证基线（生产工程就绪后）

```bash
pnpm tsc:check
pnpm lint
pnpm test            # 含库存守恒不变量、AI 归因检测器回归
pnpm test:e2e
pnpm build
```

原型阶段验证：提取 `<script>` 跑 `node --check`，并用浏览器人工确认关键界面。

## AGENTS 兼容

`AGENTS.md` 是指向本文件的软链接，用于 agents.md 规范兼容。
