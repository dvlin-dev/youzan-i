import { NextResponse } from "next/server";
import { runCopilot } from "@/lib/ai/copilot";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ kind: "text", text: "请先登录" }, { status: 401 });
  let message = "";
  try {
    const body = await req.json();
    message = String(body?.message ?? "");
  } catch {
    return NextResponse.json({ kind: "text", text: "请求格式错误" }, { status: 400 });
  }
  if (!message.trim()) return NextResponse.json({ kind: "text", text: "消息为空" }, { status: 400 });
  const result = await runCopilot(message, u.role);
  return NextResponse.json(result);
}
