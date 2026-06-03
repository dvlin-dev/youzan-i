"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LedgerDrawer } from "@/components/LedgerDrawer";
import {
  adoptStocktakeRow,
  createStocktake,
  postAllStocktake,
  resetDemo,
} from "@/lib/actions";
import type { CountRow } from "@/lib/stocktake/engine";

import { useToast } from "../toast";
import { CauseSummary } from "./components/CauseSummary";
import { DiffTable } from "./components/DiffTable";
import { StocktakeEntry } from "./components/StocktakeEntry";
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
  counts: CountRow[];
  canPost: boolean;
  canManage: boolean;
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
    counts,
    canPost,
    canManage,
  } = props;
  const [sel, setSel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
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
  async function startNew() {
    setBusy(true);
    const r = await createStocktake();
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

      {canManage && (
        <div
          className="toolbar"
          style={{ display: "flex", gap: 10, marginBottom: 14 }}
        >
          {!posted && (
            <button className="btn sm" onClick={() => setEntering((e) => !e)}>
              {entering ? "← 返回对账" : "录实盘"}
            </button>
          )}
          {posted && (
            <button
              className="btn primary sm"
              onClick={startNew}
              disabled={busy}
            >
              {busy ? "发起中…" : "发起新盘点"}
            </button>
          )}
        </div>
      )}

      {entering ? (
        <StocktakeEntry rows={counts} onDone={() => setEntering(false)} />
      ) : (
        <>
          <CauseSummary summary={summary} />
          <DiffTable rows={rows} openCount={open.length} onSelect={setSel} />
        </>
      )}

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
