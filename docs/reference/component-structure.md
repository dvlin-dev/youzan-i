# 组件与模块结构

> 跨需求复用的结构约定。架构事实源见 [../design/tech-stack.md](../design/tech-stack.md)；本文定"代码怎么摆"。

## 分层职责（与现有目录对齐）

| 层 | 目录 | 职责 |
| --- | --- | --- |
| 数据 / 不变量 | `lib/db/*` | 表、append-only 流水、派生查询、原子守恒过账 |
| 类型化工具层 | `lib/actions.ts`、`lib/ai/tools.ts` | 带守恒 + 权限 + 审计的操作入口（UI 与 AI 复用） |
| 纯逻辑 | `lib/stock-math.ts`、`lib/stocktake/*`、`lib/ai/sql-guard.ts`、`lib/money.ts` | 无 IO、可单测的纯函数 |
| 页面 | `app/(app)/{dashboard,stock,move,purchase,stocktake}` | 角色化 RSC，组合数据与组件 |
| UI 组件 | `components/*` | 薄展示层，调用工具层、不直接改真相源 |

## 拆分阈值

| 条件 | 做法 |
| --- | --- |
| 组件 < 120 行且逻辑简单 | 保持单文件 |
| `return` 的 JSX 过长 / 有可独立命名的区块 | **拆成子组件**，父只负责组合 |
| 一个组件出现 2+ 仅服务它的子组件 | 该组件建目录：`组件名/{index.tsx, components/, types.ts}`（如 `MoveBoard/`、`LedgerDrawer/`） |
| 可测的业务判断 / 数据转换 | **下沉到 `lib/`（纯函数），不藏在 JSX/事件里** |
| 类型被多文件复用 | 抽到就近 `types.ts` 或对应 `lib` 模块 |
| 逻辑被 2+ 模块复用 | 提升到 `lib/`（逻辑）或 `components/`（UI） |

## 条件渲染：早返回，不堆三元

UI 里的分支不要堆成 `return` 末尾的长三元 / 深层嵌套三元（`a ? (...) : b ? (...) : null`），改用**早返回**——在组件或一个 `renderXxx()` 辅助函数顶部就 `if (条件) return <X/>`：

```tsx
// ✗ 堆在 return 里的嵌套三元，越读越深
return <div>{resolved ? <Done/> : onAdopt ? <Adopt/> : null}</div>;

// ✓ 早返回辅助函数，分支扁平、各自独立
function renderFooter() {
  if (resolved) return <Done />;
  if (onAdopt) return <Adopt />;
  return null;
}
return <div>{renderFooter()}</div>;
```

- 派生值、分支判断、样式计算在 `return` **之前**用具名 `const` / 小函数算好；`return` 尽量只剩组合。
- 两选一的整块（如「盘点视图 vs 普通视图」）拆成一个子组件，内部 `if (recon) return <ReconCards/>; return <StockCards/>`。
- 重复的内联样式 / className 选择抽成具名 `const` 或小 helper（如 `dotColor(row)`），不在 JSX 里重复写三元。
- 简单的一元 className 选择（`x ? "a" : "b"`）可保留内联，本规则针对的是**成块、嵌套、累积**的条件 UI。

## 状态分层（真相源 vs 会话态）

- **真相源**：库存 = `stock_ledger` 流水累加（派生）；待复核草稿在 `move_draft`。只能经工具层追加，不可直接改。
- **会话态**：选中行、抽屉开合、AI 流式中间态、当前筛选——**只活在组件本地 / Zustand 等会话状态，不写进真相源、不进流水**。
- 实盘等一次性输入不进状态，其长期痕迹是它生成的流水（见根 `CLAUDE.md` 硬约束）。

## 禁止项

- 禁止 UI 组件直接修改库存 / 真相源（必须调 `lib/actions.ts` / `lib/ai/tools.ts`）。
- 禁止复制第二套关键逻辑事实源（守恒、归因、SQL 校验只一处）。
- 禁止把可测业务逻辑埋在 JSX 或事件回调里。
- **禁止为"看起来工程化"提前创建空文件 / 空目录**——需要时再建。
- 不为当前体量引入仓储层 / 命令总线 / DI 等过度架构。
