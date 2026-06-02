# 云链进销存（jxc）

服装批发场景的 **进销存系统**：入库出库、库存预警、采购单、盘点对账——并走向 **AI-Native**。

> 客户原话痛点："8 个人用 Excel 记库存、上月盘点差了三万多。"
> 解法核心：把库存从"可被覆盖的数字"重构为**由不可变流水累加出的派生值**，用守恒不变量 + 双人复核从结构上消灭错账；让 AI 经类型化工具层成为系统的一等操作者，而它所需的安全地基恰好就是治错账的那一套。

## 现在能看什么

```bash
open jxc-prototype.html      # 单文件、零依赖、可离线打开的高保真原型
```

原型含：库存 SKU 矩阵、出入库 + 双人复核、采购单状态机、**盘点对账两层 AI 归因闭环**、AI 助手侧栏（自然语言 → 工具调用预览 → HITL）、⌘K 命令面板、三角色权限。

## 知识库（docs/）

| 入口 | 内容 |
| --- | --- |
| [CLAUDE.md](./CLAUDE.md) | 仓库级协作入口：项目概述、架构边界、硬约束、工作规则 |
| [docs/design/](./docs/design/index.md) | 规范事实源：领域模型、盘点对账、AI-Native 架构、交互原则 |
| [docs/plan/](./docs/plan/index.md) | 执行期计划（当前：生产化为 Next.js + Postgres + Vercel） |
| [docs/reference/](./docs/reference/index.md) | 工程规范、评分卡、Prompt/Skill 模板、AI 交付方法论全文 |

文档治理规则见 [docs/CLAUDE.md](./docs/CLAUDE.md)。`AGENTS.md` 为 `CLAUDE.md` 的软链接（agents.md 规范兼容）。

## 核心理念（一句话）

- **库存 = 流水累加**（不可变 append-only ledger），守恒不变量 `I1/I2` 随时成立；纠错只能红冲，永久留痕。
- **盘点对账**不是"找差异"，而是 AI 两层归因把"差三万"**拆成可执行的几摞**：真损失该认、串色该互换、重复该红冲、可索赔该去追、在途是假差异。
- **AI 不写裸 SQL、不直接落库**：只调经守恒 + 权限 + 审计的类型化工具，写操作先预览、经人确认（HITL）。

## 路线图

- ✅ 高保真原型（`jxc-prototype.html`）
- ⏳ 生产化：**Next.js 15 全栈 + Postgres，一键部署 Vercel**——见 [生产化计划](./docs/plan/2026-06-02-production-nextjs-vercel.md)。

## 协作规范

参与开发前请先读 [CLAUDE.md](./CLAUDE.md) 的《硬约束》——任何"改变库存"的代码路径都需逐条自检。
