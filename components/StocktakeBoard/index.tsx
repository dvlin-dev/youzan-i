"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LedgerDrawer } from "@/components/LedgerDrawer";
import { adoptStocktakeRow, postAllStocktake, resetDemo } from "@/lib/actions";

import { useToast } from "../toast";
import { CauseSummary } from "./components/CauseSummary";
import { DiffTable } from "./components/DiffTable";
import { StocktakeHeader } from "./components/StocktakeHeader";
import type { Row, Summary } from "./types";

export function StocktakeBoard(props: {
  pdNo: string;
  status: string;
  scope: string;
  counter: string;
  snapTs: string;
  countedAt: string;
  rows: Row[];
  summary: Summary;
  canPost: boolean;
  canCost: boolean;
}) {
  const {
    pdNo,
    status,
    scope,
    counter,
    snapTs,
    countedAt,
    rows,
    summary,
    canPost,
  } = props;
  const [sel, setSel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const posted = status === "已过账";
  const open = rows.filter((r) => !r.resolved);

  async function adopt(skuCode: string) {
    setBusy(true);
    const r = await adoptStocktakeRow(skuCode);
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) {
      setSel(null);
      router.refresh();
    }
  }
  async function postAll() {
    setBusy(true);
    const r = await postAllStocktake();
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) router.refresh();
  }
  async function reset() {
    setBusy(true);
    const r = await resetDemo();
    toast(r.msg, r.ok ? "ok" : "err");
    setBusy(false);
    if (r.ok) router.refresh();
  }

  return (
    <>
      <StocktakeHeader
        pdNo={pdNo}
        status={status}
        scope={scope}
        counter={counter}
        snapTs={snapTs}
        countedAt={countedAt}
        posted={posted}
        canPost={canPost}
        busy={busy}
        openCount={open.length}
        onPostAll={postAll}
        onReset={reset}
      />

      <CauseSummary summary={summary} />

      <DiffTable rows={rows} openCount={open.length} onSelect={setSel} />

      {sel && (
        <LedgerDrawer
          skuCode={sel.skuCode}
          canCost={props.canCost}
          recon={{
            book: sel.book,
            actual: sel.actual,
            diff: sel.diff,
            attr: sel.attr,
            resolved: sel.resolved,
          }}
          onClose={() => setSel(null)}
          onAdopt={canPost && !sel.resolved ? adopt : undefined}
        />
      )}
    </>
  );
}
