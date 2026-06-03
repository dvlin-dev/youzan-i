import { aiEnabled, getOpenAIClient } from "./client";

export type ExplainInput = {
  styleName: string;
  color: string;
  size: string;
  book: number;
  actual: number;
  diff: number;
  bucket: string;
  badge: string;
  /** 第 1 层确定性检测器命中的证据（LLM 只能基于这些事实，不得编造） */
  evidence: string[];
  /** 该 SKU 的流水摘要（按时间） */
  ledgerBrief: string;
};

/**
 * 第 2 层归因：把第 1 层「确定性检测器」的命中假设 + 证据交给 LLM，
 * 让它对成因排序、给出可执行解释。硬约束：只能基于给定证据推理，禁止编造新证据；
 * 第 1 层仍是权威（分桶 / 金额 / 真损失判定不依赖 LLM）。无 key 时返回空串，由调用方降级。
 */
export async function explainAttribution(input: ExplainInput): Promise<string> {
  if (!aiEnabled()) return "";
  const client = await getOpenAIClient();
  const sys =
    "你是服装批发进销存系统的盘点归因分析师。第 1 层确定性检测器已给出最可能成因与证据，" +
    "你的任务是：基于【且仅基于】这些证据，对成因可能性排序并给出简明、可执行的解释。" +
    "严禁编造检测器之外的证据或数字；若证据不足以支撑某假设，就如实说明。" +
    "用中文，4 句以内，先给最可能成因与理由，再给 1 条下一步建议。不要用 Markdown 标题。\n" +
    "示例口吻：「重复入库可能性最高——到货单 IN-20260518-088 有两笔等量入库（各 +48），账面虚高约 48 件；建议红冲其中一笔。」";
  const user = [
    `SKU：${input.styleName} ${input.color}/${input.size}`,
    `账面快照 ${input.book}，实盘 ${input.actual}，差异 ${input.diff > 0 ? "+" : ""}${input.diff}`,
    `检测器初判：${input.badge}（bucket=${input.bucket}）`,
    `命中证据：\n${input.evidence.map((e) => `- ${e}`).join("\n")}`,
    `该 SKU 流水：\n${input.ledgerBrief}`,
  ].join("\n");

  const r = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}
