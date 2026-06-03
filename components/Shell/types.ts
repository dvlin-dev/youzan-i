import type { Role } from "@/lib/constants";

export type NavItem = [string, string, string];

export const NAV: Record<Role, NavItem[]> = {
  warehouse: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/move", "入库 / 出库", "in"],
  ],
  buyer: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/purchase", "采购单", "cart"],
    ["/stocktake", "盘点对账", "scale"],
  ],
  admin: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/move", "入库 / 出库", "in"],
    ["/purchase", "采购单", "cart"],
    ["/stocktake", "盘点对账", "scale"],
  ],
};

export const TITLES: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/stock": "库存",
  "/move": "入库 / 出库",
  "/purchase": "采购单",
  "/stocktake": "盘点对账",
};
