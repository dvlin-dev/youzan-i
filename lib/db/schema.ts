import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["warehouse", "buyer", "admin"]);
export const ledgerStatusEnum = pgEnum("ledger_status", ["pending", "posted"]);
export const poStatusEnum = pgEnum("po_status", [
  "草稿",
  "已下单",
  "部分到货",
  "已入库",
  "已取消",
]);
export const stocktakeStatusEnum = pgEnum("stocktake_status", [
  "待复核",
  "已过账",
]);

/** 用户与角色。 */
export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
});

/** SKU：款号 × 颜色 × 尺码。金额为整数分。 */
export const sku = pgTable(
  "sku",
  {
    skuCode: text("sku_code").primaryKey(),
    styleNo: text("style_no").notNull(),
    styleName: text("style_name").notNull(),
    category: text("category").notNull(),
    color: text("color").notNull(),
    size: text("size").notNull(),
    costPrice: integer("cost_price").notNull(),
    tagPrice: integer("tag_price").notNull(),
    safetyStock: integer("safety_stock").notNull().default(25),
    barcode: text("barcode").notNull(),
  },
  (t) => [index("sku_style_idx").on(t.styleNo)],
);

/**
 * 不可变流水：唯一真相源。库存 = SUM(delta)（库内行皆 posted）。**append-only**——
 * 只有 INSERT，没有 UPDATE / DELETE 入口；纠错只能追加反向流水（红冲）。
 * 待复核的草稿不落在这里，而是 `move_draft`（见下），复核通过才作为 posted 行追加进来。
 */
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: serial("id").primaryKey(),
    skuCode: text("sku_code")
      .notNull()
      .references(() => sku.skuCode),
    delta: integer("delta").notNull(),
    bizType: text("biz_type").notNull(),
    docNo: text("doc_no").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    operatorId: text("operator_id").notNull(),
    reviewerId: text("reviewer_id"),
    status: ledgerStatusEnum("status").notNull().default("pending"),
    scanned: boolean("scanned").notNull().default(true),
    qc: boolean("qc"),
    poRef: text("po_ref"),
    reversedBy: integer("reversed_by"),
    pdAdjust: boolean("pd_adjust").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ledger_sku_idx").on(t.skuCode),
    index("ledger_status_idx").on(t.status),
  ],
);

/**
 * 待复核草稿：「改变库存的动作」在复核入账前的暂存区。
 * 与不可变流水**物理隔离**——草稿可改可删（驳回即删），从不污染 ledger；
 * 复核通过时由 `postDraftAtomic` 把草稿作为 posted 行追加进 `stock_ledger` 并删除草稿。
 * 这样 `stock_ledger` 严格只增不改不删，「append-only」名副其实。
 */
export const moveDraft = pgTable(
  "move_draft",
  {
    id: serial("id").primaryKey(),
    docNo: text("doc_no").notNull(),
    skuCode: text("sku_code")
      .notNull()
      .references(() => sku.skuCode),
    delta: integer("delta").notNull(),
    bizType: text("biz_type").notNull(),
    operatorId: text("operator_id").notNull(),
    poRef: text("po_ref"),
    qc: boolean("qc"),
    scanned: boolean("scanned").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("draft_doc_idx").on(t.docNo),
    index("draft_po_idx").on(t.poRef),
  ],
);

export const purchaseOrder = pgTable("purchase_order", {
  poNo: text("po_no").primaryKey(),
  supplier: text("supplier").notNull(),
  status: poStatusEnum("status").notNull().default("草稿"),
  createdBy: text("created_by").notNull(),
  eta: text("eta"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const poLine = pgTable("po_line", {
  id: serial("id").primaryKey(),
  poNo: text("po_no")
    .notNull()
    .references(() => purchaseOrder.poNo),
  skuCode: text("sku_code").notNull(),
  ordered: integer("ordered").notNull(),
  received: integer("received").notNull().default(0),
  price: integer("price").notNull(),
});

export const stocktake = pgTable("stocktake", {
  pdNo: text("pd_no").primaryKey(),
  scope: text("scope").notNull(),
  status: stocktakeStatusEnum("status").notNull().default("待复核"),
  snapTs: timestamp("snap_ts", { withTimezone: true }).notNull(),
  counter: text("counter").notNull(),
  createdBy: text("created_by").notNull(),
  countedAt: timestamp("counted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stocktakeCount = pgTable("stocktake_count", {
  id: serial("id").primaryKey(),
  pdNo: text("pd_no")
    .notNull()
    .references(() => stocktake.pdNo),
  skuCode: text("sku_code").notNull(),
  bookSnapshot: integer("book_snapshot").notNull(),
  actual: integer("actual").notNull(),
  resolved: boolean("resolved").notNull().default(false),
});

export type Sku = typeof sku.$inferSelect;
export type StockLedger = typeof stockLedger.$inferSelect;
export type NewLedger = typeof stockLedger.$inferInsert;
export type MoveDraft = typeof moveDraft.$inferSelect;
export type NewMoveDraft = typeof moveDraft.$inferInsert;
export type PurchaseOrder = typeof purchaseOrder.$inferSelect;
export type PoLine = typeof poLine.$inferSelect;
export type Stocktake = typeof stocktake.$inferSelect;
export type StocktakeCount = typeof stocktakeCount.$inferSelect;
export type AppUser = typeof appUser.$inferSelect;
