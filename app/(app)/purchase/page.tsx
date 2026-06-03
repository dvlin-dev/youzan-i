import { LockView } from "@/components/LockView";
import { PoBoard } from "@/components/PoBoard";
import { can } from "@/lib/constants";
import { allSkus, listPos, pendingDocs, stockMap } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";

export default async function PurchasePage() {
  const user = (await currentUser())!;
  if (!can.po(user.role)) return <LockView name="采购单" />;
  const [pos, drafts, skus, sm] = await Promise.all([
    listPos(),
    pendingDocs(),
    allSkus(),
    stockMap(),
  ]);
  const skuOpts = skus.map((s) => ({
    skuCode: s.skuCode,
    styleNo: s.styleNo,
    styleName: s.styleName,
    color: s.color,
    size: s.size,
    qty: sm[s.skuCode] ?? 0,
  }));
  // 哪些采购单已有「待复核到货草稿」——用于禁止重复登记、解释进度未更新
  const pendingPo = new Set(
    Object.values(drafts).flatMap((rows) =>
      rows.map((r) => r.poRef).filter((x): x is string => !!x),
    ),
  );
  const data = pos.map((p) => ({
    poNo: p.poNo,
    supplier: p.supplier,
    status: p.status,
    eta: p.eta,
    pendingReceive: pendingPo.has(p.poNo),
    lines: p.lines.map((l) => ({
      skuCode: l.skuCode,
      ordered: l.ordered,
      received: l.received,
      price: l.price,
    })),
  }));
  return <PoBoard pos={data} canCost={can.cost(user.role)} skus={skuOpts} />;
}
