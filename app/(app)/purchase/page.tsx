import { listPos } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/constants";
import { PoBoard } from "@/components/PoBoard";
import { LockView } from "@/components/LockView";

export default async function PurchasePage() {
  const user = (await currentUser())!;
  if (!can.po(user.role)) return <LockView name="采购单" />;
  const pos = await listPos();
  const data = pos.map((p) => ({
    poNo: p.poNo,
    supplier: p.supplier,
    status: p.status,
    eta: p.eta,
    lines: p.lines.map((l) => ({ skuCode: l.skuCode, ordered: l.ordered, received: l.received, price: l.price })),
  }));
  return <PoBoard pos={data} canCost={can.cost(user.role)} />;
}
