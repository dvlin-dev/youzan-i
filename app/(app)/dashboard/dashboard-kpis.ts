import { type Role, can } from "@/lib/constants";

export type Kpi = {
  lbl: string;
  val: string;
  unit: string;
  icon: string;
  tone: string;
  bg: string;
  sub: string;
};

export type ReconCard = { lbl: string; val: string; tone: string; sub: string };

/** 角色分支的 KPI 列表组装：纯函数，输入已取好的计数与对账卡，输出 4 张卡。 */
export function buildDashboardKpis({
  role,
  totalUnits,
  skuCount,
  lowCount,
  dangerN,
  pendCount,
  styleCount,
  reconCard,
}: {
  role: Role;
  totalUnits: number;
  skuCount: number;
  lowCount: number;
  dangerN: number;
  pendCount: number;
  styleCount: number;
  reconCard: ReconCard;
}): Kpi[] {
  return [
    {
      lbl: "在库总件数",
      val: totalUnits.toLocaleString("zh-CN"),
      unit: "件",
      icon: "box",
      tone: "var(--primary-600)",
      bg: "var(--primary-weak)",
      sub: `${skuCount} 个 SKU`,
    },
    {
      lbl: "低库存 SKU",
      val: String(lowCount),
      unit: "个",
      icon: "alert",
      tone: "var(--warn)",
      bg: "var(--warn-weak)",
      sub: `含 ${dangerN} 个断码`,
    },
    {
      lbl: reconCard.lbl,
      val: reconCard.val,
      unit: "",
      icon: "scale",
      tone: reconCard.tone,
      bg: "var(--danger-weak)",
      sub: reconCard.sub,
    },
    can.recon(role)
      ? {
          lbl: "待复核单据",
          val: String(pendCount),
          unit: "单",
          icon: "clock",
          tone: "var(--text-2)",
          bg: "var(--surface-2)",
          sub: "审批后才入账",
        }
      : {
          lbl: "在售款数",
          val: String(styleCount),
          unit: "款",
          icon: "box",
          tone: "var(--teal)",
          bg: "var(--teal-weak)",
          sub: `${skuCount} 个 SKU`,
        },
  ];
}
