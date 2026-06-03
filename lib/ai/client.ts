import type OpenAIType from "openai";

export function aiEnabled() {
  return !!process.env.OPENAI_API_KEY;
}

let cached: OpenAIType | null = null;
/**
 * 配置好的 OpenAI 客户端（经第三方兼容网关 OPENAI_BASE_URL）。
 * 动态 import，避免 openai 包在构建期被求值。copilot 与归因解释共用同一份配置。
 */
export async function getOpenAIClient(): Promise<OpenAIType> {
  if (!cached) {
    const OpenAI = (await import("openai")).default;
    cached = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  return cached;
}
