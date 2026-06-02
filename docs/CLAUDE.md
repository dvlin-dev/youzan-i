# docs 目录指南

> `docs` 目录治理规则。仅在文档结构、事实归属或协作方式变化时更新。

## 结构约束

`docs/` 第一层只保留：

```text
docs/
├─ CLAUDE.md
├─ AGENTS.md -> CLAUDE.md
├─ design/        # 规范事实源
├─ plan/          # 执行期计划
└─ reference/     # 长期规范与方法论
```

| 目录 | 内容 |
| --- | --- |
| `design/` | 稳定架构事实、数据模型、能力边界（领域模型 / 盘点对账 / AI-Native 架构 / 交互原则） |
| `plan/` | 执行期计划、任务清单、验证记录、复审过程 |
| `reference/` | 长期规范：工程标准、评分卡、Prompt/Skill 模板、AI 交付方法论 |

禁止新增长期并行目录（如 `spec/`、`archive/`、`notes/`）。临时需要先放 `docs/plan/`，完成后回写事实源并精简。

每个子目录维护一个 `index.md` 作为入口与索引。

## 生命周期

| 状态 | 位置 |
| --- | --- |
| 方案草稿 / 执行计划 | `docs/plan/` |
| 已确认架构事实 | `docs/design/` |
| 长期工程规则 / 方法论 | `docs/reference/` |
| 历史过程 | `docs/plan/` 可保留必要验证记录，不作为事实源 |

## 回写规则

1. 新需求先在 `docs/plan/` 写计划。
2. 实现完成后，将稳定事实回写到 `docs/design/` 或 `docs/reference/`。
3. `docs/plan/` 可保留必要验证记录，但不要成为第二事实源。
4. **同一主题只能有一个正式事实源。** `reference/ai-delivery-methodology.md` 是叙事性方法论全文，与 design/reference 专题文档冲突时以专题文档为准。

## 命名

- 计划：`YYYY-MM-DD-<topic>-plan.md` 或 `<topic>.md`，配图放 `docs/plan/assets/`。
- 规范 / 设计：`<topic>.md`，小写中划线。

## AGENTS 兼容

`docs/AGENTS.md` 是指向本文件的软链接。
