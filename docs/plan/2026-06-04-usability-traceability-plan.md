# 计划：商品档案自建（A）+ 可追溯闭环（B）

> 状态：**已完成（2026-06-04）**。稳定事实已回写 [`design/domain-model.md`](../design/domain-model.md)、[`design/ai-native-architecture.md`](../design/ai-native-architecture.md)、[`design/tech-stack.md`](../design/tech-stack.md)。本文仅保留落地决策与验证记录，不作第二事实源。

## 动机

跨过「可用线」后（能开采购单、发起盘点）仍有两块离落地有距离：

- **A 商品档案是 seed 死的**——能开单据，却没法新增一个款、改安全库存阈值。「能输入自己的数据」这条线上最后一个大缺口。
- **B 可追溯不闭环**——`ledger.operator_id` 是自由文本人名（可乱填、可指向幽灵如「仓管阿强」），`query_sql` 审计只落 console 没落表。一个主打「永久留痕、可追溯」的系统，出了错账查不到「谁、用哪条 SQL、何时」。

## A · 商品档案自建

- 新权限位 `can.sku`（采购 + 老板，与 cost/recon/po 一致；仓管只录出入库不碰主数据与定价）。
- `createSku`：按 颜色 × 尺码 批量建档，库存从 0 起（建档不造流水 → 新款以断码呈现，符合「库存 = 流水累加」）；已存在的 款/色/码 跳过（去重护栏）。
- `setStyleSafetyStock`：按款统一改安全库存阈值。
- UI：`StockBrowser` 工具栏「建档」抽屉（`CreateSkuForm`：款号/品名/品类/成本价/吊牌价/安全库存 + 颜色 chips 调色板 + 自定义 × 尺码 chips，实时预览「将生成 N 个 SKU」）；展开矩阵底部内联「改安全库存」（`SafetyStockEditor`）。两者都按 `can.sku` 双闸（数据层动作校验 + UI 隐藏）。

## B · 可追溯闭环

- **operator_id → user.id（外键）**：流水/草稿 operator_id·reviewer_id、采购单 created_by、盘点单 counter·created_by 全部改存 `app_user.id` 并加外键约束。展示层按 id join 取名（`queries.userNames`），`fetchLedger`/move 待复核卡/`StocktakeHeader` 三处解析。
- **query_sql 审计落表**：新增 `query_audit` 表（append-only，actor_id + actor_name 冗余 + role + sql + outcome + reason + row_count）；`auditSqlQuery` 异步落表（保留 console；落表失败 try/catch 不阻断查询）。tools.ts 四个分支 `await audit(...)`。
- **AI 安全取名**：新增脱敏视图 `app_user_public(id, name, role)`（无 email / password_hash），授予两个只读角色；`query_sql` 经它 join 取操作人姓名，口令表本体仍 DB 层拒读。

## 落地决策与踩坑

- **迁移顺序**：现网 DB 是上一次 seed 的人名数据，先 `db:push` 加外键会 FK 冲突。正确顺序 **seed（灌 id 数据）→ push（加外键 + query_audit 表）→ 加视图**。
- **少一个幽灵用户**：原 seed 的复核人「仓管阿强」不是真实用户。改为 OP=u_wh（仓管小李 录入）、OP2=u_ad（陈总复核），3 个 demo 用户即可满足全部外键，删掉幽灵。
- **审计表越权读漏洞（自查 + 修复）**：`query_audit` 由 `db:push` 新建，Neon 默认把新表授予 PUBLIC → 只读角色（query_sql）竟能读到全员查询记录。显式 `REVOKE ALL ON query_audit FROM jxc_readonly / jxc_readonly_wh / PUBLIC`，并写进 `setup-readonly.ts`。被审计者不可读自己的审计。

## 验证记录

- 基线全绿：`pnpm typecheck` / `lint` / `format:check` / `test`（91 passed）/ `build`；`test:integration`（query_sql）8/8。
- **A 端到端（浏览器，老板）**：建「测试连衣裙」2 色 × 2 码 → 共 SKU 79→83、首行断码 0；多次点提交仅建 4 个（去重护栏）；`setStyleSafetyStock("AW2024-TEST1", 10)` 落库 + toast。RBAC：仓管无「建档」按钮、无成本、无安全编辑器。
- **B1 显示（浏览器）**：流水抽屉「仓管小李 录入 · 陈总 复核」——DB 存 u_wh/u_ad 外键 id，展示层解析成人名。
- **B 安全（只读角色实连）**：`app_user_public` 可读；`app_user` 基表 `permission denied`（口令表物理不可读）；`stock_ledger JOIN app_user_public ON operator_id` 取名成功。
- **B2 审计（query_sql.execute 实跑）**：正常查询 + 拒写「drop table sku」各落 1 行 query_audit（actor 陈总 / outcome ok·rejected）；两个只读角色读 query_audit 均 `permission denied`。
- 现网 DB（本地/线上共用一库）已 seed + push + 视图 + revoke + 清空测试审计行（clean：audit 0 / ledger 201 / sku 79 / users 3）。
- 待部署：新代码须随后上线，否则线上旧代码写 operator_id=人名会被新外键拒（迁移已先行）。
