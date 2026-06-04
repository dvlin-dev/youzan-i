"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { setStyleSafetyStock } from "@/lib/actions";

/** 内联改安全库存：把整款的预警阈值统一改成新值（预警 = 库存 < 安全库存）。仅档案管理者可见。 */
export function SafetyStockEditor({
  styleNo,
  current,
}: {
  styleNo: string;
  current: number;
}) {
  const [val, setVal] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const n = parseInt(val, 10);
  const dirty = Number.isInteger(n) && n >= 0 && n !== current;

  async function save() {
    if (!dirty) return;
    setBusy(true);
    const r = await setStyleSafetyStock(styleNo, n);
    setBusy(false);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }

  return (
    <div
      className="row"
      style={{ gap: 8, marginTop: 12, alignItems: "center", fontSize: 12.5 }}
    >
      <span className="dim">安全库存阈值</span>
      <input
        className="qty-in"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ width: 64 }}
      />
      <span className="dim">件 / 款</span>
      <button
        className="btn sm"
        onClick={save}
        disabled={!dirty || busy}
        style={{ marginLeft: 2 }}
      >
        <Icon name="check" size={12} /> {busy ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
