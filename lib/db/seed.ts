import bcrypt from "bcryptjs";
import { db } from "./client";
import {
  appUser,
  sku,
  stockLedger,
  purchaseOrder,
  poLine,
  stocktake,
  stocktakeCount,
  type NewLedger,
} from "./schema";
import { DEMO_USERS, PD_SNAP_TS } from "../constants";

const BASE = new Date("2026-05-30T09:00:00+08:00");
function daysAgo(n: number, hm = "09:00"): Date {
  const d = new Date(BASE);
  d.setDate(d.getDate() - n);
  const [h, m] = hm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
const d = (iso: string) => new Date(iso);

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLES = [
  { no: "AW2024-3301", name: "加绒高领针织衫", cat: "针织衫", cost: 12000, tag: 29900, colors: ["藏青", "黑", "米白"], sizes: ["S", "M", "L", "XL"] },
  { no: "AW2024-2087", name: "微弹牛仔直筒裤", cat: "牛仔裤", cost: 9800, tag: 25900, colors: ["蓝", "黑"], sizes: ["M", "L", "XL", "2XL"] },
  { no: "AW2024-5512", name: "法式落肩开衫", cat: "针织衫", cost: 8800, tag: 21900, colors: ["米白", "卡其", "墨绿"], sizes: ["S", "M", "L"] },
  { no: "AW2024-6620", name: "连帽加绒卫衣", cat: "卫衣", cost: 6900, tag: 15900, colors: ["黑", "灰", "酒红"], sizes: ["M", "L", "XL", "2XL"] },
  { no: "AW2024-4408", name: "羊毛混纺西裤", cat: "裤装", cost: 11900, tag: 32900, colors: ["黑", "灰"], sizes: ["S", "M", "L", "XL"] },
  { no: "AW2024-7731", name: "轻量羽绒马甲", cat: "外套", cost: 15900, tag: 39900, colors: ["黑", "藏青", "卡其"], sizes: ["M", "L", "XL"] },
  { no: "AW2024-1109", name: "真丝缎面衬衫", cat: "衬衫", cost: 7900, tag: 19900, colors: ["白", "米白", "酒红"], sizes: ["S", "M", "L"] },
  { no: "AW2024-9902", name: "美式工装夹克", cat: "外套", cost: 13900, tag: 35900, colors: ["卡其", "墨绿", "黑"], sizes: ["M", "L", "XL", "2XL"] },
];

const OP = "仓管小李";
const OP2 = "仓管阿强";

export async function seed() {
  // 幂等重灌：按外键顺序清空
  await db.delete(stocktakeCount);
  await db.delete(stocktake);
  await db.delete(poLine);
  await db.delete(purchaseOrder);
  await db.delete(stockLedger);
  await db.delete(sku);
  await db.delete(appUser);

  // 用户
  await db.insert(appUser).values(
    DEMO_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      passwordHash: bcrypt.hashSync(u.password, 10),
      role: u.role,
    })),
  );

  // SKU
  const skus: (typeof sku.$inferInsert)[] = [];
  let bc = 0;
  for (const st of STYLES) {
    for (const c of st.colors) {
      for (const sz of st.sizes) {
        skus.push({
          skuCode: `${st.no}-${c}-${sz}`,
          styleNo: st.no,
          styleName: st.name,
          category: st.cat,
          color: c,
          size: sz,
          costPrice: st.cost,
          tagPrice: st.tag,
          safetyStock: 25,
          barcode: "69" + (220000000 + bc++ * 131).toString().slice(0, 9),
        });
      }
    }
  }
  await db.insert(sku).values(skus);

  const TRAPS = new Set([
    "AW2024-3301-藏青-M",
    "AW2024-3301-黑-M",
    "AW2024-5512-米白-M",
    "AW2024-9902-卡其-L",
    "AW2024-2087-蓝-L",
    "AW2024-7731-黑-L",
    "AW2024-6620-灰-XL",
    "AW2024-4408-黑-M",
    "AW2024-1109-白-M",
  ]);
  // 手工编排库存（断码 / 低于安全库存），同样要排除出基线
  const MANUAL = new Set([
    "AW2024-3301-米白-S",
    "AW2024-6620-酒红-2XL",
    "AW2024-5512-墨绿-M",
    "AW2024-1109-酒红-L",
    "AW2024-6620-酒红-M",
  ]);

  const rows: NewLedger[] = [];
  const post = (o: Partial<NewLedger> & { skuCode: string; delta: number; bizType: string; docNo: string; ts: Date }) =>
    rows.push({ status: "posted", operatorId: OP, reviewerId: OP2, scanned: true, ...o });

  // —— 基线流水（跳过埋雷 SKU）——
  const R = rng(20260530);
  skus.forEach((s, i) => {
    if (TRAPS.has(s.skuCode) || MANUAL.has(s.skuCode)) return;
    const init = Math.round(60 + R() * 180);
    post({ skuCode: s.skuCode, delta: init, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
    let stock = init;
    if (R() > 0.25) {
      const q = Math.round(20 + R() * 100);
      post({ skuCode: s.skuCode, delta: q, bizType: "采购到货", docNo: "IN-2026" + (415 + (i % 20)), ts: daysAgo(Math.round(6 + R() * 18), "10:12") });
      stock += q;
    }
    if (R() > 0.2) {
      const q = Math.min(stock - 5, Math.round(10 + R() * 80));
      if (q > 0) post({ skuCode: s.skuCode, delta: -q, bizType: "销售出库", docNo: "OUT-2026" + (420 + (i % 25)), ts: daysAgo(Math.round(1 + R() * 12), "14:40") });
    }
  });

  // 断码（=0）让库存预警有料
  for (const k of ["AW2024-3301-米白-S", "AW2024-6620-酒红-2XL"]) {
    post({ skuCode: k, delta: 48, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
    post({ skuCode: k, delta: -48, bizType: "销售出库", docNo: "OUT-20260512-077", ts: daysAgo(4, "11:20") });
  }
  // 低于安全库存（warn）
  for (const [k, init, out] of [
    ["AW2024-5512-墨绿-M", 30, 18],
    ["AW2024-1109-酒红-L", 40, 28],
    ["AW2024-6620-酒红-M", 50, 38],
  ] as [string, number, number][]) {
    post({ skuCode: k, delta: init, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
    post({ skuCode: k, delta: -out, bizType: "销售出库", docNo: "OUT-20260520-088", ts: daysAgo(5, "13:00") });
  }

  // —— 9 个埋雷（6 类成因），每条留好证据 ——
  // ① 串色：藏青/M 账面120（入库100里有25件实为黑/M）；黑/M 账面40
  post({ skuCode: "AW2024-3301-藏青-M", delta: 50, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-3301-藏青-M", delta: 100, bizType: "采购到货", docNo: "IN-20260408-012", ts: d("2026-04-08T09:30:00+08:00"), poRef: "PO-20260405-001", scanned: false, qc: true });
  post({ skuCode: "AW2024-3301-藏青-M", delta: -30, bizType: "销售出库", docNo: "OUT-20260420-031", ts: d("2026-04-20T14:05:00+08:00") });
  post({ skuCode: "AW2024-3301-黑-M", delta: 60, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-3301-黑-M", delta: -20, bizType: "销售出库", docNo: "OUT-20260420-031", ts: d("2026-04-20T14:05:00+08:00") });
  // ② 供应商少发：米白/M 收货照单全收(收=应收90)且未质检
  post({ skuCode: "AW2024-5512-米白-M", delta: 30, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-5512-米白-M", delta: 90, bizType: "采购到货", docNo: "IN-20260524-002", ts: d("2026-05-24T10:10:00+08:00"), poRef: "PO-20260524-002", scanned: false, qc: false });
  post({ skuCode: "AW2024-5512-米白-M", delta: -30, bizType: "销售出库", docNo: "OUT-20260520-066", ts: d("2026-05-20T15:00:00+08:00") });
  // ③ 重复入库：卡其/L 同一到货单号录了两次 +48
  post({ skuCode: "AW2024-9902-卡其-L", delta: 50, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-9902-卡其-L", delta: 48, bizType: "采购到货", docNo: "IN-20260518-088", ts: d("2026-05-18T09:20:00+08:00"), poRef: "PO-20260515-004", scanned: true, qc: true });
  post({ skuCode: "AW2024-9902-卡其-L", delta: 48, bizType: "采购到货", docNo: "IN-20260518-088", ts: d("2026-05-18T16:40:00+08:00"), poRef: "PO-20260515-004", scanned: false, qc: true });
  post({ skuCode: "AW2024-9902-卡其-L", delta: -6, bizType: "销售出库", docNo: "OUT-20260526-091", ts: d("2026-05-26T11:00:00+08:00") });
  // ④ 在途未录：蓝/L 快照(16:00)后才入账的到货 +40 → 假差异（账面快照=50，现库存=90）
  post({ skuCode: "AW2024-2087-蓝-L", delta: 80, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-2087-蓝-L", delta: -30, bizType: "销售出库", docNo: "OUT-20260522-070", ts: d("2026-05-22T14:20:00+08:00") });
  post({ skuCode: "AW2024-2087-蓝-L", delta: 40, bizType: "采购到货", docNo: "IN-20260530-022", ts: d("2026-05-30T16:30:00+08:00"), poRef: "PO-20260528-006", scanned: true, qc: true });
  // ⑤ 实物损耗（查无解释）
  post({ skuCode: "AW2024-7731-黑-L", delta: 48, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-7731-黑-L", delta: 30, bizType: "采购到货", docNo: "IN-20260510-040", ts: d("2026-05-10T09:00:00+08:00"), scanned: true, qc: true });
  post({ skuCode: "AW2024-7731-黑-L", delta: -10, bizType: "销售出库", docNo: "OUT-20260515-052", ts: d("2026-05-15T10:30:00+08:00") });
  post({ skuCode: "AW2024-6620-灰-XL", delta: 70, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-6620-灰-XL", delta: 40, bizType: "采购到货", docNo: "IN-20260512-045", ts: d("2026-05-12T09:00:00+08:00"), scanned: true, qc: true });
  post({ skuCode: "AW2024-6620-灰-XL", delta: -22, bizType: "销售出库", docNo: "OUT-20260524-080", ts: d("2026-05-24T16:00:00+08:00") });
  post({ skuCode: "AW2024-1109-白-M", delta: 50, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-1109-白-M", delta: -10, bizType: "销售出库", docNo: "OUT-20260518-060", ts: d("2026-05-18T11:00:00+08:00") });
  // 疑错发：4408黑/M 近期大额出库
  post({ skuCode: "AW2024-4408-黑-M", delta: 70, bizType: "期初", docNo: "INIT-2026Q2", ts: daysAgo(60) });
  post({ skuCode: "AW2024-4408-黑-M", delta: -30, bizType: "销售出库", docNo: "OUT-20260527-095", ts: d("2026-05-27T15:30:00+08:00") });

  await db.insert(stockLedger).values(rows);

  // —— 采购单 ——
  await db.insert(purchaseOrder).values([
    { poNo: "PO-20260405-001", supplier: "宁波恒源针织", status: "已入库", createdBy: "采购王姐", eta: "2026-04-08", createdAt: d("2026-04-05T09:00:00+08:00") },
    { poNo: "PO-20260515-004", supplier: "杭州盛织服饰", status: "已入库", createdBy: "采购王姐", eta: "2026-05-18", createdAt: d("2026-05-15T09:00:00+08:00") },
    { poNo: "PO-20260524-002", supplier: "宁波恒源针织", status: "已入库", createdBy: "采购王姐", eta: "2026-05-24", createdAt: d("2026-05-24T09:00:00+08:00") },
    { poNo: "PO-20260528-006", supplier: "杭州盛织服饰", status: "部分到货", createdBy: "采购王姐", eta: "2026-06-02", createdAt: d("2026-05-28T09:00:00+08:00") },
    { poNo: "PO-20260601-009", supplier: "广州潮牌制衣", status: "已下单", createdBy: "采购王姐", eta: "2026-06-06", createdAt: d("2026-06-01T09:00:00+08:00") },
    { poNo: "PO-20260602-011", supplier: "杭州盛织服饰", status: "草稿", createdBy: "采购王姐", eta: "2026-06-08", createdAt: d("2026-06-02T09:00:00+08:00") },
  ]);
  await db.insert(poLine).values([
    { poNo: "PO-20260405-001", skuCode: "AW2024-3301-藏青-M", ordered: 100, received: 100, price: 12000 },
    { poNo: "PO-20260515-004", skuCode: "AW2024-9902-卡其-L", ordered: 48, received: 48, price: 13900 },
    { poNo: "PO-20260524-002", skuCode: "AW2024-5512-米白-M", ordered: 90, received: 90, price: 8800 },
    { poNo: "PO-20260528-006", skuCode: "AW2024-2087-蓝-L", ordered: 60, received: 40, price: 9800 },
    { poNo: "PO-20260601-009", skuCode: "AW2024-6620-黑-XL", ordered: 150, received: 0, price: 6900 },
    { poNo: "PO-20260601-009", skuCode: "AW2024-6620-灰-2XL", ordered: 100, received: 0, price: 6900 },
    { poNo: "PO-20260602-011", skuCode: "AW2024-7731-黑-L", ordered: 60, received: 0, price: 15900 },
  ]);

  // —— 盘点单（待复核），实盘已录入 ——
  await db.insert(stocktake).values({
    pdNo: "PD-20260530-001",
    scope: "全仓盘点",
    status: "待复核",
    snapTs: d(PD_SNAP_TS),
    counter: "仓管小李",
    createdBy: "陈总",
    countedAt: d("2026-05-30T17:20:00+08:00"),
  });
  const COUNTS: [string, number, number][] = [
    ["AW2024-3301-藏青-M", 120, 95],
    ["AW2024-3301-黑-M", 40, 65],
    ["AW2024-5512-米白-M", 90, 30],
    ["AW2024-9902-卡其-L", 140, 92],
    ["AW2024-2087-蓝-L", 50, 90],
    ["AW2024-7731-黑-L", 68, 30],
    ["AW2024-6620-灰-XL", 88, 40],
    ["AW2024-4408-黑-M", 40, 6],
    ["AW2024-1109-白-M", 40, 6],
  ];
  await db.insert(stocktakeCount).values(
    COUNTS.map(([skuCode, bookSnapshot, actual]) => ({
      pdNo: "PD-20260530-001",
      skuCode,
      bookSnapshot,
      actual,
    })),
  );

  return { users: DEMO_USERS.length, skus: skus.length, ledger: rows.length };
}

// 直接运行（pnpm db:seed）时执行；被 /reset-demo 等 import 时不自动跑。
const isMain = typeof process !== "undefined" && process.argv[1]?.includes("seed");
if (isMain) {
  seed()
    .then((r) => {
      console.log("✓ seeded", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error("seed failed", e);
      process.exit(1);
    });
}
