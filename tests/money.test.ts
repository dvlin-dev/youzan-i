import { describe, expect, it } from "vitest";

import { wan, yuan } from "../lib/money";

describe("金额（整数分存储，仅展示层 /100）", () => {
  it("分 → 元，按整数运算无浮点漂移", () => {
    expect(yuan(0)).toBe("¥0");
    expect(yuan(10)).toBe("¥0.1");
    expect(yuan(12345)).toBe("¥123.45");
  });

  it("负号与千分位", () => {
    expect(yuan(-3103800)).toContain("¥31,038"); // 盘亏毛额 ≈ −¥3.1 万
    expect(yuan(-100).startsWith("¥")).toBe(false); // 带负号前缀
  });

  it("万元紧凑展示", () => {
    expect(wan(3103800)).toBe("¥3.10 万");
  });
});
