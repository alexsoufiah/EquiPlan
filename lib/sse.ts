// Shared SSE broadcast — module-level state persists across requests in the same Node process

type Ctrl = ReadableStreamDefaultController<Uint8Array>;
const clients = new Set<Ctrl>();
const enc = new TextEncoder();

export function addClient(ctrl: Ctrl) {
  clients.add(ctrl);
}

export function removeClient(ctrl: Ctrl) {
  clients.delete(ctrl);
}

export function broadcast(event: string, data: Record<string, unknown> = {}) {
  const msg = enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(msg);
    } catch {
      clients.delete(ctrl);
    }
  }
}
