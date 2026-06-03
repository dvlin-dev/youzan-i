import type { Role } from "@/lib/constants";

export const SUGG: Record<Role, string[]> = {
  warehouse: [
    "AW2024-3301 藏青/黑/米白 M 各入 50 件",
    "黑色 L 卫衣 出 24 件",
    "哪些 SKU 快断货了？",
  ],
  buyer: [
    "帮我对一下账，差在哪",
    "哪些 SKU 快断货了？",
    "查 AW2024-9902 卡其 L 库存",
  ],
  admin: [
    "看看哪些快断货了，都补到 30",
    "AW2024-3301 藏青 M 入 30、黑 M 出 20",
    "帮我对一下账，差在哪",
  ],
};
