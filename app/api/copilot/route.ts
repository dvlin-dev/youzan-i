import { streamCopilot } from "@/lib/ai/copilot";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const NDJSON = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no", // 禁用反代缓冲，保证逐事件下发
};

const line = (obj: unknown) => JSON.stringify(obj) + "\n";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return new Response(line({ t: "error", message: "请先登录" }), { status: 401, headers: NDJSON });

  let message = "";
  try {
    const body = await req.json();
    message = String(body?.message ?? "");
  } catch {
    return new Response(line({ t: "error", message: "请求格式错误" }), { status: 400, headers: NDJSON });
  }
  if (!message.trim()) return new Response(line({ t: "error", message: "消息为空" }), { status: 400, headers: NDJSON });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of streamCopilot(message, u.role)) {
          controller.enqueue(encoder.encode(line(ev)));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(line({ t: "error", message: e instanceof Error ? e.message : String(e) })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: NDJSON });
}
