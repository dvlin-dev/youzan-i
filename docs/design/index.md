# design · 规范事实源

> 长期维护的架构与数据模型事实。每个主题只此一份；改动须与 `../reference/engineering-standards.md` 保持一致。

| 文档 | 内容 |
| --- | --- |
| [domain-model.md](./domain-model.md) | 三维 SKU、不可变流水、库存守恒 I1/I2、待复核审批闸、采购单状态机、角色权限矩阵 |
| [stocktake-reconciliation.md](./stocktake-reconciliation.md) | 盘点校准模型、两类差异、6 类成因、两层 AI 归因引擎、盘点闭环 |
| [ai-native-architecture.md](./ai-native-architecture.md) | 类型化工具层、分层 L0–L3、HITL、NL→动作、工具链路、安全治理 |
| [ux-principles.md](./ux-principles.md) | 操作台设计立场、关键交互模式、Excel 平滑迁移 |

参考实现：仓库根目录 `jxc-prototype.html`（单文件原型，已落地以上多数规范）。
完整设计叙事与权衡过程见 [../reference/ai-delivery-methodology.md](../reference/ai-delivery-methodology.md)。
