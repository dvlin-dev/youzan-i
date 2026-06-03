"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useToast } from "@/components/toast";
import { rejectDoc, reviewDoc, submitMove } from "@/lib/actions";
import { SIZE_ORDER } from "@/lib/constants";

import { MoveEntryCard } from "./components/MoveEntryCard";
import { PendingReviewCard } from "./components/PendingReviewCard";
import type { Pend, SkuRow } from "./types";

export function MoveBoard({
  skus,
  pending,
}: {
  skus: SkuRow[];
  pending: Pend[];
}) {
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [style, setStyle] = useState(skus[0]?.styleNo ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const router = useRouter();
  const toast = useToast();

  const styles = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of skus) if (!m.has(s.styleNo)) m.set(s.styleNo, s.styleName);
    return [...m.entries()];
  }, [skus]);
  const cur = skus.filter((s) => s.styleNo === style);
  const colors = [...new Set(cur.map((s) => s.color))];
  const sizes = [...new Set(cur.map((s) => s.size))].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
  );
  const total = Object.values(qty).reduce((a, v) => a + (parseInt(v) || 0), 0);

  async function submit() {
    setErr("");
    const entries = Object.entries(qty)
      .map(([k, v]) => ({ skuCode: k, qty: parseInt(v) || 0 }))
      .filter((e) => e.qty > 0);
    if (!entries.length) return setErr("请至少录入一个数量");
    const r = await submitMove({ type, entries });
    if (!r.ok) return setErr(r.msg);
    toast(r.msg);
    setQty({});
    router.refresh();
  }
  async function review(doc: string) {
    const r = await reviewDoc(doc);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }
  async function reject(doc: string) {
    const r = await rejectDoc(doc);
    toast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) router.refresh();
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: 18,
        alignItems: "start",
      }}
    >
      <MoveEntryCard
        type={type}
        onTypeChange={setType}
        style={style}
        onStyleChange={setStyle}
        styles={styles}
        colors={colors}
        sizes={sizes}
        cur={cur}
        qty={qty}
        onQtyChange={setQty}
        total={total}
        err={err}
        onSubmit={submit}
      />
      <PendingReviewCard
        pending={pending}
        onReview={review}
        onReject={reject}
      />
    </div>
  );
}
