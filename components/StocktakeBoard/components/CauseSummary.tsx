import { Icon } from "@/components/icons";
import { DEMO_MODE } from "@/lib/constants";
import { yuan } from "@/lib/money";

import { BUCKETS, type Summary } from "../types";

/** 成因汇总：盘亏毛额 / 真损失 / 可追回 + I2 自洽，以及 AI 分桶明细。 */
export function CauseSummary({ summary }: { summary: Summary }) {
  return (
    <>
      <div className="stat-strip">
        <div className="ss">
          <div className="k">盘亏毛额（账面看着差这么多）</div>
          <div className="v neg tnum">{yuan(summary.loss)}</div>
          {DEMO_MODE && (
            <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
              ≈ 客户说的&ldquo;差了三万多&rdquo;
            </div>
          )}
        </div>
        <div className="ss">
          <div className="k">AI 归因后 · 真实物净损失</div>
          <div className="v tnum" style={{ color: "var(--danger-2)" }}>
            {yuan(summary.real)}
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            失窃 / 损耗 / 报损，该认
          </div>
        </div>
        <div className="ss">
          <div className="k">可追回（索赔 / 客户）</div>
          <div className="v tnum" style={{ color: "var(--warn)" }}>
            {yuan(summary.recover)}
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            供应商少发 + 疑错发
          </div>
        </div>
        <div className="ss">
          <div className="k">账目自洽性</div>
          <div className="v" style={{ color: "var(--success)", fontSize: 18 }}>
            I2 成立
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            库存 = 流水累加，差在账实侧
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          background: "linear-gradient(100deg,#EAF1ED,#F3EEDF)",
          borderColor: "#D8E1D2",
          marginBottom: 16,
        }}
      >
        <div
          className="row"
          style={{ gap: 12, padding: "13px 16px", alignItems: "flex-start" }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "#fff",
              color: "var(--primary-600)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Icon name="spark" size={18} />
          </span>
          <div>
            <b>AI 把{DEMO_MODE ? "“差三万”" : "差异"}拆成了可执行的几摞：</b>
            <div style={{ marginTop: 7 }}>
              {BUCKETS.map(([b, label, tone]) => {
                const v = summary.buckets[b];
                if (!v) return null;
                return (
                  <span
                    className={"pill " + tone}
                    key={b}
                    style={{ margin: "2px 6px 2px 0" }}
                  >
                    <span className="dot" />
                    {label} {yuan(v.val)} · {v.n}项
                  </span>
                );
              })}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 7 }}>
              点任意行看<b>该 SKU 的流水链 + AI 归因证据 + 修复建议</b>
              ；确认后过账，差异即归零。
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
