import { listPos, pendingDocs } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/constants";
import { PoBoard } from "@/components/PoBoard";
import { LockView } from "@/components/LockView";

export default async function PurchasePage() {
  const user = (await currentUser())!;
  if (!can.po(user.role)) return <LockView name="采购单" />;
  const [pos, drafts] = await Promise.all([listPos(), pendingDocs()]);
  // 哪些采购单已有「待复核到货草稿」——用于禁止重复登记、解释进度未更新
  const pendingPo = new Set(
    Object.values(drafts).flatMap((rows) => rows.map((r) => r.poRef).filter((x): x is string => !!x)),
  );
  const data = pos.map((p) => ({
    poNo: p.poNo,
    supplier: p.supplier,
    status: p.status,
    eta: p.eta,
    pendingReceive: pendingPo.has(p.poNo),
    lines: p.lines.map((l) => ({ skuCode: l.skuCode, ordered: l.ordered, received: l.received, price: l.price })),
  }));
  return <PoBoard pos={data} canCost={can.cost(user.role)} />;
}
