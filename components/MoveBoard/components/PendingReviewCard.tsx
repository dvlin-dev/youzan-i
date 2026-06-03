import { Icon } from "@/components/icons";
import { DEMO_MODE } from "@/lib/constants";

import type { Pend } from "../types";

function PendingCard({
  p,
  onReview,
  onReject,
}: {
  p: Pend;
  onReview: (doc: string) => void;
  onReject: (doc: string) => void;
}) {
  return (
    <div
      className="alert-row"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
    >
      <div className="between">
        <span className={"pill " + (p.type === "入库" ? "info" : "teal")}>
          <span className="dot" />
          {p.type} · {p.n} SKU · {p.sum}件
        </span>
        <span className="ld-doc">{p.doc}</span>
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        录入：{p.operator}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={() => onReview(p.doc)}>
          <Icon name="check" size={13} /> 审批通过
        </button>
        <button className="btn sm" onClick={() => onReject(p.doc)}>
          驳回
        </button>
      </div>
    </div>
  );
}

/** 待复核卡：审批闸——改库动作先进这里，审批后才入账。 */
export function PendingReviewCard({
  pending,
  onReview,
  onReject,
}: {
  pending: Pend[];
  onReview: (doc: string) => void;
  onReject: (doc: string) => void;
}) {
  return (
    <div className="card pad">
      <h2 className="sec">
        待复核{" "}
        {pending.length > 0 && (
          <span className="pill warn" style={{ marginLeft: 6 }}>
            <span className="dot" />
            {pending.length}
          </span>
        )}
      </h2>
      <div
        className="dim"
        style={{ fontSize: 12, margin: "-4px 0 12px", display: "flex", gap: 6 }}
      >
        <Icon name="shield" size={13} />
        <span>
          改变库存的动作先进<b>待复核</b>、<b>审批</b>
          后才入账（任何人可审批，含录入人本人）；入账有守恒护栏不让库存为负——这正是治
          {DEMO_MODE ? "“盘点差三万”" : "错账"}的根因。
        </span>
      </div>
      {pending.length === 0 && (
        <div className="empty" style={{ padding: "30px 10px" }}>
          <div className="e-ic">
            <Icon name="check" size={26} />
          </div>
          <h3>暂无待复核单据</h3>
        </div>
      )}
      {pending.map((p) => (
        <PendingCard
          key={p.doc}
          p={p}
          onReview={onReview}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
