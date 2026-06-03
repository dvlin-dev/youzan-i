"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createStocktake } from "@/lib/actions";

import { Icon } from "./icons";
import { useToast } from "./toast";

/** 发起盘点按钮（空态用）：账面快照取当前库存，建好后去「录实盘」。 */
export function StartStocktake() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function go() {
    setBusy(true);
    const r = await createStocktake();
    setBusy(false);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }

  return (
    <button
      className="btn primary"
      style={{ marginTop: 14 }}
      onClick={go}
      disabled={busy}
    >
      <Icon name="check" size={14} /> {busy ? "发起中…" : "发起盘点"}
    </button>
  );
}
