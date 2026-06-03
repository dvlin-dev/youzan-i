/**
 * 库存守恒的纯函数核心（无 IO、无可变外部状态）——可单测，是「库存=流水累加」的代码化表达。
 * 守恒不变量：
 *   I2 单一真相：库存永远 = SUM(流水.delta)，不存在可被覆盖的独立库存数。
 *   纠错只能红冲（追加反向流水），原始流水永久留痕，故行数只增不减。
 */

/** 库存 = 流水 delta 累加（派生值）。 */
export function sumDeltas(rows: { delta: number }[]): number {
  return rows.reduce((a, r) => a + r.delta, 0);
}

/** 逐笔结存（不可变流水的 running balance），渲染纯函数、无外部可变量。 */
export function runningBalances<T extends { delta: number }>(
  rows: T[],
): { row: T; balance: number }[] {
  const out: { row: T; balance: number }[] = [];
  for (const r of rows)
    out.push({
      row: r,
      balance: (out[out.length - 1]?.balance ?? 0) + r.delta,
    });
  return out;
}
