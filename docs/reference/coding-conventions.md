# 协作与上线规范

> 协作流程 + 上线门禁 + 本项目特定编码约定。通用工程规则（代码原则 / 命名 / TS / React / 样式 / lint）见
> [engineering-standards.md](./engineering-standards.md)；架构事实见 [../design/tech-stack.md](../design/tech-stack.md) 与 [../design/domain-model.md](../design/domain-model.md)；根 `CLAUDE.md` 为硬约束总纲。

## 本项目特定编码约定

- **金额整数分**：统一 `cents` 存储与计算，仅展示层 `/100`；合计 = 逐单求和、逐分对齐。
- **可预期错误结构化返回**：返回 `{ ok, msg }` 之类结构，不靠抛异常做流程控制；不变量违例 → 告警 + 阻断。
- **先读现状再改**：优先复用已有类型 / 工具 / helper。
- 通用代码原则 / 命名 / TS / React / 样式 / lint 规则统一见 [engineering-standards.md](./engineering-standards.md)。

## 协作

- 中文沟通；未经明确授权不 `git commit` / `git push` / `git tag`。
- 改动任何"动库存"路径，提交前对照根 `CLAUDE.md`《硬约束》逐条自检。
- 复审反馈先验证适用性再修，不盲改。

## 上线门禁（每版按"可直接稳定上线"交付，不交毛坯房）

| 维度 | 标准 |
| --- | --- |
| 产品体验 | 核心路径符合直觉；无错位 / 遮挡 / 临时样式 / 半成品入口 |
| 架构质量 | 模块职责清楚；数据 / 工具 / UI / 样式边界清晰；不为赶进度绕过既有边界 |
| 代码质量 | 类型 / lint / 格式 / 构建通过；无调试代码、临时 hack、无主 TODO |
| 测试质量 | 本次风险点有单测 / 集成 / 浏览器冒烟覆盖；失败测试不得忽略或跳过 |
| 文档状态 | 稳定事实回写 `design/` 或 `reference/`；plan 不充当事实源 |
| 安全依赖 | `pnpm audit` 0 漏洞；新增依赖有明确用途、不过度 |
| 复审闭环 | 自审 + 独立复审完成；Blocker / High 必修；Medium 修或明确记录 |

**Definition of Done**：需求完整实现无隐藏"后补"关键路径；无绕过工具层直改真相源；会话态未写进流水 / 文档；风险点有对应测试；全量验证通过；稳定文档已回写。任一不满足不得宣称完成。

## 复审分级

自审 → 子 agent / 独立复审 → 按级处理 → 改了架构边界就**重复复审**：

- **Blocker / High**：必须修。
- **Medium**：默认修；暂不修须写明原因、风险、后续位置。
- **Low**：视范围决定，但不影响上线体验。

## 验证基线

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# 工具链就绪后再加：pnpm format:check && pnpm audit（0 漏洞）
```

库存守恒（I1/I2）与 6 类归因检测器、AI 安全边界（RBAC 越权 / query_sql 守门）必须有单测常驻（`tests/*`）；只读连接层集成用 `pnpm test:integration`；UI 变更人工确认关键界面（agent-browser / 浏览器）。
