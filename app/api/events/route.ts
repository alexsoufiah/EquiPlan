import { NextResponse } from "next/server";
import { addClient, removeClient, broadcast } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      addClient(ctrl);
      // Initial ping so the client knows it's connected
      ctrl.enqueue(enc.encode(": connected\n\n"));

      // Keepalive every 20s to prevent proxy/Cloudflare timeout
      const ka = setInterval(() => {
        try {
          ctrl.enqueue(enc.encode(": ping\n\n"));
        } catch {
          clearInterval(ka);
          removeClient(ctrl);
        }
      }, 20_000);

      // Cleanup when client disconnects
      const cleanup = () => {
        clearInterval(ka);
        removeClient(ctrl);
        try { ctrl.close(); } catch { /* already closed */ }
      };
      // Attach cleanup — stream cancel handles normal disconnect
      (ctrl as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel(ctrl) {
      removeClient(ctrl);
      (ctrl as unknown as { _cleanup?: () => void })._cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Internal trigger endpoint — called server-side via fetch when data changes
export async function POST() {
  broadcast("update", { ts: Date.now() });
  return NextResponse.json({ ok: true, clients: 0 });
}
