# 编码与协作规范

> 跨需求复用的编码约定与协作流程。技术栈 / 目录结构 / 不变量的**架构事实**见
> [../design/tech-stack.md](../design/tech-stack.md) 与 [../design/domain-model.md](../design/domain-model.md)；根 `CLAUDE.md` 为硬约束总纲。

## 编码约定

- **金额整数分**：统一 `cents` 存储与计算，仅展示层 `/100`；合计 = 逐单求和、逐分对齐。
- **可预期错误结构化返回**：返回 `{ ok, msg }` 之类结构，不靠抛异常做流程控制；不变量违例 → 告警 + 阻断。
- **命名**：文件小写中划线，变量 camelCase，类型 PascalCase。
- **先读现状再改**：优先复用已有类型 / 工具 / helper；模块化、单一职责，但不为当前体量过度设计。

## 协作

- 中文沟通；未经明确授权不 `git commit` / `git push` / `git tag`。
- 改动任何"动库存"路径，提交前对照根 `CLAUDE.md`《硬约束》逐条自检。

## 验证基线

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

库存守恒（I1/I2）与 6 类归因检测器必须有单测常驻（`tests/*`）；UI 变更人工确认关键界面（agent-browser / 浏览器）。
