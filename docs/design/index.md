# design · 规范事实源

> 长期维护的架构与数据模型事实。每个主题只此一份；可复用的编码/协作规范见 `../reference/coding-conventions.md`。

| 文档 | 内容 |
| --- | --- |
| [domain-model.md](./domain-model.md) | 三维 SKU、不可变流水、库存守恒 I1/I2、待复核审批闸、采购单状态机、角色权限矩阵 |
| [stocktake-reconciliation.md](./stocktake-reconciliation.md) | 盘点校准模型、两类差异、6 类成因、两层 AI 归因引擎、盘点闭环 |
| [ai-native-architecture.md](./ai-native-architecture.md) | 类型化工具层、分层 L0–L3、HITL、NL→动作、工具链路、安全治理 |
| [tech-stack.md](./tech-stack.md) | 技术栈选型、代码目录 / 模块职责、核心不变量 → 代码落地映射 |
| [ux-principles.md](./ux-principles.md) | 操作台设计立场、关键交互模式、Excel 平滑迁移 |

讲解 / 演示：单页讲解文档（产品如何解决问题 + 技术架构 + 研发知识库 + 交付方法论），演示讲解用。
源文件 `public/docs.html`，线上经 `/docs` 路由直达（`next.config.ts` rewrite）：[线上 /docs](https://youzan.dvlin.com/docs) ·本地 `pnpm dev` 后 http://localhost:3000/docs 。

参考实现：仓库根目录 `jxc-prototype.html`（单文件原型，已落地以上多数规范）。
完整设计叙事与权衡过程见 [../reference/ai-delivery-methodology.md](../reference/ai-delivery-methodology.md)。
