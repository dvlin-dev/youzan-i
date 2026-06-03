/** 金额一律以「整数分」存储与计算，仅展示层 /100 格式化。 */
export function yuan(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const v = Math.abs(cents) / 100;
  return (
    sign +
    "¥" +
    v.toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

/** 紧凑万元展示，用于 KPI。 */
export function wan(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return sign + "¥" + (Math.abs(cents) / 1_000_000).toFixed(2) + " 万";
}
