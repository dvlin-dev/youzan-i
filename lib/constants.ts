export type Role = "warehouse" | "buyer" | "admin";

/**
 * 演示模式开关（默认开）。线上 demo 保留「· Demo」副标、角色切换、重置演示数据等；
 * 真实小商家部署时设 `NEXT_PUBLIC_DEMO_MODE=0` 即可全部关掉，避免向真实用户露馅 / 误重置真账。
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";

export const ROLE_LABEL: Record<Role, string> = {
  warehouse: "仓管",
  buyer: "采购",
  admin: "老板",
};

/** 三个内置演示账号（登录页预填、点击即登）。 */
export const DEMO_USERS: {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
}[] = [
  {
    id: "u_wh",
    name: "仓管小李",
    email: "warehouse@demo.com",
    password: "demo1234",
    role: "warehouse",
  },
  {
    id: "u_by",
    name: "采购王姐",
    email: "buyer@demo.com",
    password: "demo1234",
    role: "buyer",
  },
  {
    id: "u_ad",
    name: "陈总",
    email: "admin@demo.com",
    password: "demo1234",
    role: "admin",
  },
];

export const SIZE_ORDER = ["S", "M", "L", "XL", "2XL"];

export const COLOR_HEX: Record<string, string> = {
  藏青: "#26344f",
  黑: "#222222",
  白: "#e8e6e0",
  米白: "#ddd6c5",
  灰: "#8a8a8a",
  酒红: "#6e2433",
  卡其: "#b3986b",
  墨绿: "#3a5547",
  蓝: "#2f5da8",
};

/** 盘点账面快照时点（埋雷数据围绕它编排）。 */
export const PD_SNAP_TS = "2026-05-30T16:00:00+08:00";

/** RBAC：角色能看/能做什么（数据层校验依据）。 */
export const can = {
  cost: (role: Role) => role !== "warehouse",
  recon: (role: Role) => role !== "warehouse",
  po: (role: Role) => role !== "warehouse",
  // 商品档案（建款 / 改价 / 改安全库存）：采购 + 老板。仓管只录出入库，不碰主数据与定价。
  sku: (role: Role) => role !== "warehouse",
  move: (role: Role) => role !== "buyer",
  postStocktake: (role: Role) => role === "admin",
};
