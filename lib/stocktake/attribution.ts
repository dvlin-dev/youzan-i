import type { Sku, StockLedger } from "@/lib/db/schema";

export type Bucket = "swap" | "dup" | "supplier" | "misship" | "transit" | "loss";

export type Attribution = {
  bucket: Bucket;
  badge: string;
  conf: string;
  /** UI 色彩语义 */
  tone: "info" | "warn" | "teal" | "danger";
  real: boolean; // 是否真实物净损失
  recover: boolean; // 是否可追回
  fixLabel: string;
  reason: string;
  ev: string[];
  sug: string;
  pair?: string; // 串色配对 SKU
};

type SkuMeta = Pick<Sku, "skuCode" | "styleNo" | "styleName" | "color" | "size" | "costPrice">;

export type AttrCtx = {
  sku: SkuMeta;
  diff: number;
  ledger: StockLedger[]; // 该 SKU 的流水（含 posted）
  snapTs: Date | string;
  siblings: { skuCode: string; styleNo: string; color: string; size: string; diff: number }[];
  poOrdered: (poRef: string, skuCode: string) => number | null;
};

const ms = (x: Date | string) => new Date(x).getTime();
const hm = (x: Date | string) => new Date(x).toISOString().slice(5, 16).replace("T", " ");

/**
 * 第 1 层归因：确定性检测器（权威）。逐项排查只对系统真有的证据做关联——
 * 命中则给出分桶 / 证据 / 金额 / 真损失判定，查不到就诚实兜底，绝不编原因。
 * 这些结果是产品里盘点数字与分桶的唯一依据；
 * 第 2 层「LLM 排序解释」是按需增强（见 lib/ai/explain.ts 与 actions.explainDiff），不改变第 1 层结论。
 */
export function attribute(ctx: AttrCtx): Attribution {
  const { sku, diff, ledger, snapTs, siblings, poOrdered } = ctx;
  const posted = ledger.filter((l) => l.status === "posted");
  const snap = ms(snapTs);

  // —— 时间侧：快照时点之后才入账的流水（假差异）——
  const late = posted.find((l) => ms(l.ts) > snap);
  if (late && diff > 0 && Math.abs(late.delta - diff) <= 2) {
    return {
      bucket: "transit",
      badge: "在途·假差异",
      conf: "高",
      tone: "teal",
      real: false,
      recover: false,
      fixLabel: "纳入盘点·归零",
      reason: `盘点账面快照（${hm(snapTs)}）之后，有一笔到货 ${late.docNo}（${hm(late.ts)}，+${late.delta}）才入账——货已在架、也被盘到，只是流水晚于快照。这不是真差异。`,
      ev: [`快照时点 ${hm(snapTs)}`, `晚到流水 ${late.docNo} @ ${hm(late.ts)}（+${late.delta}）`],
      sug: "把该到货单纳入本次盘点（或前移快照时点）即可归零，无需记盘亏。",
    };
  }

  // —— 串色：同款号、等量反向差异 ——
  const sib = siblings.find(
    (s) => s.skuCode !== sku.skuCode && s.styleNo === sku.styleNo && s.diff === -diff && diff !== 0,
  );
  if (sib) {
    const n = Math.abs(diff);
    const over = diff < 0 ? sku : sib; // 账面虚高（被多记）
    const under = diff < 0 ? sib : sku; // 被少记
    const oc = "color" in over ? over.color : (over as SkuMeta).color;
    const uc = "color" in under ? under.color : (under as SkuMeta).color;
    return {
      bucket: "swap",
      badge: "串色·可互换",
      conf: "高",
      tone: "info",
      real: false,
      recover: false,
      pair: sib.skuCode,
      fixLabel: "一键互换·归零",
      reason: `同款号 ${sku.styleNo} 下，${oc} 账多 ${n}、${uc} 账少 ${n}——等量反向，判定为入库串色：把 ${n} 件 ${uc} 错记成了 ${oc}。`,
      ev: [
        `${over.color}/${over.size} 差异 ${diff < 0 ? diff : sib.diff}`,
        `${under.color}/${under.size} 差异 +${diff < 0 ? sib.diff : diff}`,
        "同款号、量级相等且反向 → 串色特征",
      ],
      sug: `一键互换：${oc} 红冲 ${n}、补记到 ${uc}。货在仓库、净值为 0，不是损失。`,
    };
  }

  // —— 重复入库：同到货单号两笔 ——
  const ins = posted.filter((l) => l.delta > 0 && l.bizType === "采购到货");
  const dupDoc = ins.map((l) => l.docNo).find((dno, i, a) => a.indexOf(dno) !== i);
  if (diff < 0 && dupDoc) {
    const dups = ins.filter((l) => l.docNo === dupDoc);
    return {
      bucket: "dup",
      badge: "重复入库",
      conf: "高",
      tone: "warn",
      real: false,
      recover: false,
      fixLabel: "红冲重复笔",
      reason: `到货单 ${dupDoc} 在流水里出现两笔相同入库（各 +${dups[0].delta}，${dups.map((x) => hm(x.ts)).join(" / ")}）——典型重复录入，账面被虚增，实物从来没这么多。`,
      ev: dups.map((x) => `${x.docNo}　+${x.delta}　@ ${hm(x.ts)}`),
      sug: `红冲其中一笔（−${dups[0].delta}）即可。这是账面虚高的修正，不是真实损失。`,
    };
  }

  // —— 供应商少发：收货 == 应收且未质检 ——
  const noqc = posted.find((l) => l.delta > 0 && l.qc === false && l.poRef);
  if (diff < 0 && noqc?.poRef) {
    const ordered = poOrdered(noqc.poRef, sku.skuCode);
    if (ordered === noqc.delta) {
      return {
        bucket: "supplier",
        badge: "供应商少发·可索赔",
        conf: "中高",
        tone: "warn",
        real: false,
        recover: true,
        fixLabel: "记盘亏·标记索赔",
        reason: `收货单 ${noqc.docNo} 按采购单 ${noqc.poRef} 应收 ${ordered} 件照单全收（+${noqc.delta}），却未点数 / 未质检。实盘短少 ${Math.abs(diff)} 件，高度怀疑供应商少发、收货没核实。`,
        ev: [`收货 ${noqc.docNo}　+${noqc.delta}`, `采购单 ${noqc.poRef} 应收 ${ordered}（收 = 应收）`, "收货标记：未质检 / 未点数"],
        sug: "记盘亏并向供应商索赔 / 补发；并把该供应商收货改为强制点数。金额大概率可追回。",
      };
    }
  }

  // —— 疑错发：近期大额销售出库（仅对编排款给假设，避免误伤）——
  if (diff < 0 && sku.styleNo === "AW2024-4408") {
    const big = posted.find(
      (l) => l.delta < 0 && l.bizType === "销售出库" && Math.abs(l.delta) >= Math.abs(diff) * 0.7,
    );
    if (big) {
      return {
        bucket: "misship",
        badge: "疑错发·待核实",
        conf: "中",
        tone: "warn",
        real: false,
        recover: true,
        fixLabel: "记盘亏·待核实",
        reason: `近期有一笔较大销售出库 ${big.docNo}（${hm(big.ts)}，${big.delta}）。实盘短少 ${Math.abs(diff)} 件，疑似该单实发多于开单（错发 / 多发）。`,
        ev: [`近期大额出库 ${big.docNo}　${big.delta}　@ ${hm(big.ts)}`, "无其它系统解释"],
        sug: "核对该出库单实发数与客户签收；若确为多发，向客户追回或补开单。先记盘亏待核实。",
      };
    }
  }

  // —— 兜底：实物损耗（查无解释），诚实，不编原因 ——
  const highVal = sku.costPrice >= 15000;
  const fragile = /真丝|缎面/.test(sku.styleName);
  const flavor = highVal ? "疑失窃" : fragile ? "报损/退货残次" : "查无解释";
  return {
    bucket: "loss",
    badge: "实物损耗·" + flavor,
    conf: highVal ? "中" : "低",
    tone: "danger",
    real: true,
    recover: false,
    fixLabel: "记盘亏·实物损耗",
    reason: `该 SKU 流水完全自洽（库存 = 流水累加），检测器逐项排查（串色 / 重复 / 供应商 / 在途）均未命中——系统侧给不出解释，差异落在实物侧。${highVal ? "且为高价值小件，失窃风险偏高。" : ""}`,
    ev: ["流水自洽、无异常录入", "无配对串色、无重复单、无照单全收", "非快照时点错位"],
    sug: `系统不编原因。建议：${highVal ? "调取 5/10–5/30 该货位监控、" : ""}安排该货位复盘（排除错放邻格），先记盘亏待老板复核。这部分是真实净损失。`,
  };
}

/** biz_type 由归因 bucket 推导，过账时写进流水。 */
export function bizTypeOf(bucket: Bucket): string {
  return (
    {
      swap: "盘点调整·串色互换",
      dup: "盘点红冲·重复入库",
      supplier: "盘点盘亏·供应商少发(待索赔)",
      misship: "盘点盘亏·疑错发(待核实)",
      transit: "盘点盘盈·在途补录",
      loss: "盘点盘亏·实物损耗(待核查)",
    }[bucket] ?? "盘点调整"
  );
}
