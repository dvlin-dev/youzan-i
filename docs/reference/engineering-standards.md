# 工程规范

> 跨需求复用的工程规则事实源。架构事实见 [../design/tech-stack.md](../design/tech-stack.md)、[../design/domain-model.md](../design/domain-model.md)；根 `CLAUDE.md` 为硬约束总纲。

## 规范地图

| 关注点 | 事实源 |
| --- | --- |
| 代码原则 / 命名 / TS / React / 样式 / lint | **本文** |
| 协作流程 / 上线门禁 / DoD / 复审分级 | [coding-conventions.md](./coding-conventions.md) |
| 目录分层 / 拆分阈值 / 状态分层 | [component-structure.md](./component-structure.md) |
| 设计系统 / 交互 / a11y / token | [../design/ux-principles.md](../design/ux-principles.md) |
| 评分卡 / 回归用例 / AI 红线 | [evaluation-rubric.md](./evaluation-rubric.md) |

## 代码原则

| 原则 | 要求 |
| --- | --- |
| 单一职责 | 文件 / 模块只承担一个主要职责 |
| 复用事实源 | 守恒、归因检测器、SQL 校验、几何/计算各只一处；库存恒为流水派生 |
| 界面不改真相源 | UI 只能调 `lib/actions.ts` / `lib/ai/tools.ts`，不直接改库存（真相源 = `stock_ledger` 流水累加） |
| 纯逻辑下沉 | 可测逻辑放 `lib/`（纯函数），不藏在 JSX / 事件回调里 |
| 不过度设计 | 当前体量不引入仓储层 / 命令总线 / DI |
| 不留兼容包袱 | 新代码按当前最佳实践，不保留历史兼容分支 |

## 命名

| 类型 | 规范 |
| --- | --- |
| 工具 / lib 文件 | 小写中划线 |
| React 组件 / 组件文件 | PascalCase |
| 类型 / 接口 | PascalCase；**接口不加 `I` 前缀** |
| 函数 / 变量 | camelCase |
| 常量 | UPPER_SNAKE_CASE 或模块私有 Pascal/camel，保持局部一致 |
| 布尔变量 / 参数（新代码） | `is/should/has/can/did/will/was` 前缀（如 `isLow`、`hasCost`）——存量按 lint 渐进，不强制改名 |
| 测试 | `tests/*.test.ts`，与现有约定一致 |

## TypeScript 规则

- `strict` + `noUnusedLocals/Parameters` 等收紧项常开（见 `tsconfig.json`）。
- 结构事实源优先从 `lib/db/schema.ts` 引用，不重复定义同一结构。
- 优先显式导出边界类型；避免 `any`，可预期错误用结构化返回（`{ ok, msg }`），不靠抛异常做流程控制。
- 金额一律整数分（`cents`）存储与计算，仅展示层 `/100`。

## React / Next 规则

- 默认 Server Components；仅交互处用 `"use client"`，范围尽量小。
- 写操作走 Server Actions / 类型化工具层（守恒 + 权限 + 审计在内部），UI 不直接落库。
- 组件薄、负责组合；复杂业务规则下沉 `lib/`。子组件只服务单个组件时放该组件目录的 `components/`，多模块复用再提升到 `components/`。
- `return` 的 JSX 过长或含成块条件时，拆子组件 + **早返回**（`if (...) return ...`），不在 return 末尾堆嵌套三元（详见 [component-structure.md](./component-structure.md#条件渲染早返回不堆三元)）。
- 不新增 Context 管业务真相源；持久真相源由数据层（流水派生）承担，会话态留在组件本地（见 [component-structure.md](./component-structure.md)）。

## 样式规则

- Tailwind v4 + 设计 token；新增颜色 / 阴影 / 圆角前先判断是否应成为 token，先补 token 再消费。
- 不使用 `transition: all`（只过渡具体属性）。
- a11y 基线见 [../design/ux-principles.md](../design/ux-principles.md)。

## Lint 与测试规则

由 `eslint.config.mjs` 强制（在 `eslint-config-next` 之上加严格层）：

- `eqeqeq`（`{ null: "never" }`：比较 null 用 `== / !=`，其余用 `=== / !==`）。
- `no-console`（审计 sink / CLI 脚本经 override 放行：`lib/ai/audit.ts`、`lib/db/{seed,setup-readonly}.ts`）。
- `no-else-return`、`object-shorthand`、`prefer-object-spread`、`no-array-constructor`、`default-case-last`、`dot-notation`。
- `@typescript-eslint/array-type`、`no-inferrable-types`、`naming-convention`（typeLike PascalCase、禁 `I` 前缀接口）。
- 格式由 prettier + `@trivago` import 排序（`@/` 组 → 相对组，分隔）统一；`pnpm format(:check)`。
- **渐进开启（写进规范、暂不强制存量）**：布尔前缀命名、`switch` 穷尽检查（type-aware）、`no-await-in-loop`（顺序 DDL 等正当场景除外）。

测试分层与验证基线见 [coding-conventions.md](./coding-conventions.md) 与 [evaluation-rubric.md](./evaluation-rubric.md)。
