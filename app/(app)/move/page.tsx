import { LockView } from "@/components/LockView";
import { MoveBoard } from "@/components/MoveBoard";
import { can } from "@/lib/constants";
import { allSkus, pendingDocs, stockMap } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";

export default async function MovePage() {
  const user = (await currentUser())!;
  if (!can.move(user.role)) return <LockView name="入库 / 出库" />;
  const [skus, sm, pend] = await Promise.all([
    allSkus(),
    stockMap(),
    pendingDocs(),
  ]);
  const rows = skus.map((s) => ({
    skuCode: s.skuCode,
    styleNo: s.styleNo,
    styleName: s.styleName,
    color: s.color,
    size: s.size,
    qty: sm[s.skuCode] ?? 0,
  }));
  const pending = Object.entries(pend).map(([doc, ls]) => ({
    doc,
    type: ls[0].delta > 0 ? "入库" : "出库",
    operator: ls[0].operatorId,
    n: ls.length,
    sum: ls.reduce((a, l) => a + Math.abs(l.delta), 0),
  }));
  return <MoveBoard skus={rows} pending={pending} />;
}
