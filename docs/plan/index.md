# plan · 执行期计划

> 当前需求的计划与验证记录。命名 `YYYY-MM-DD-<topic>-plan.md`。实现完成后把稳定事实回写 `design/` 或 `reference/`，本目录不作为第二事实源。

| 计划 | 状态 |
| --- | --- |
| [2026-06-02-production-nextjs-vercel.md](./2026-06-02-production-nextjs-vercel.md) | 已落地 — 原型 → Next.js + Postgres + Vercel 生产化、一键部署 |
| [2026-06-03-readonly-sql-tool.md](./2026-06-03-readonly-sql-tool.md) | 已落地 — 只读 SQL 工具（query_sql）：三层防御 + 双只读角色 DB 层脱敏，已部署线上 |
| [2026-06-04-usability-traceability-plan.md](./2026-06-04-usability-traceability-plan.md) | 已落地 — 商品档案自建（建款/改安全库存）+ 可追溯闭环（operator_id 外键 + query_sql 审计落表 + app_user_public 脱敏视图） |
