import webpush from "web-push";
import { getDb } from "./db";

let vapidInitialized = false;

export function initVapid() {
  if (vapidInitialized) return;
  const db = getDb();

  let publicKey = (db.prepare("SELECT value FROM settings WHERE key = 'vapid_public'").get() as { value: string } | undefined)?.value;
  let privateKey = (db.prepare("SELECT value FROM settings WHERE key = 'vapid_private'").get() as { value: string } | undefined)?.value;

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_public', ?)").run(publicKey);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_private', ?)").run(privateKey);
  }

  webpush.setVapidDetails("mailto:admin@pferdeplan.local", publicKey, privateKey);
  vapidInitialized = true;
}

export function getVapidPublicKey(): string {
  const db = getDb();
  return (db.prepare("SELECT value FROM settings WHERE key = 'vapid_public'").get() as { value: string })?.value ?? "";
}

// Nur ein dauerhaft toter Endpoint (404 Not Found / 410 Gone) wird gelöscht.
// Transiente Fehler (429/500/Timeout) dürfen ein gültiges Abo NICHT entfernen.
function isGone(reason: unknown): boolean {
  const sc = (reason as { statusCode?: number } | null)?.statusCode;
  return sc === 404 || sc === 410;
}

// Abos sicher dekodieren – eine kaputte Zeile darf den ganzen Batch nicht werfen.
function parseSubs(rows: { endpoint?: string; subscription: string }[]): { endpoint: string; sub: webpush.PushSubscription }[] {
  const out: { endpoint: string; sub: webpush.PushSubscription }[] = [];
  for (const r of rows) {
    try {
      const sub = JSON.parse(r.subscription) as webpush.PushSubscription;
      const endpoint = r.endpoint ?? sub.endpoint;
      if (endpoint) out.push({ endpoint, sub });
    } catch { /* korrupte Zeile überspringen */ }
  }
  return out;
}

async function deliver(items: { endpoint: string; sub: webpush.PushSubscription }[], payload: string): Promise<number> {
  const db = getDb();
  const results = await Promise.allSettled(items.map(it => webpush.sendNotification(it.sub, payload)));
  const del = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
  let ok = 0;
  items.forEach((it, i) => {
    const r = results[i];
    if (r.status === "rejected") { if (isGone(r.reason)) del.run(it.endpoint); }
    else ok++;
  });
  return ok;
}

export async function sendPushNotification(title: string, body: string) {
  try {
    initVapid();
    const db = getDb();
    const subs = db.prepare("SELECT endpoint, subscription FROM push_subscriptions").all() as { endpoint: string; subscription: string }[];
    const items = parseSubs(subs);
    if (items.length === 0) return;
    await deliver(items, JSON.stringify({ title, body, icon: "/icon.png" }));
  } catch { /* Push darf den Aufrufer nie zum Absturz bringen */ }
}

// Gezielte Benachrichtigung: nur an die zugewiesenen Teams + den Sprecher.
// Admins werden bewusst NICHT benachrichtigt (sie lösen die Änderung selbst aus).
export async function sendTargetedPush(
  targets: { teamIds?: number[]; speakerId?: number | null },
  title: string,
  body: string,
) {
  try {
    const teamIds = targets.teamIds?.filter(Boolean) ?? [];
    const speakerId = targets.speakerId ?? null;
    if (teamIds.length === 0 && !speakerId) return;

    initVapid();
    const db = getDb();

    const conds: string[] = [];
    const args: (number | string)[] = [];
    if (teamIds.length > 0) {
      conds.push(`team_id IN (${teamIds.map(() => "?").join(",")})`);
      args.push(...teamIds);
    }
    if (speakerId) { conds.push("speaker_id = ?"); args.push(speakerId); }

    const subs = db.prepare(
      `SELECT endpoint, subscription FROM push_subscriptions WHERE ${conds.join(" OR ")}`
    ).all(...args) as { endpoint: string; subscription: string }[];
    const items = parseSubs(subs);
    if (items.length === 0) return;
    await deliver(items, JSON.stringify({ title, body, icon: "/icon.png" }));
  } catch { /* Push darf den Aufrufer nie zum Absturz bringen */ }
}

// Gezielte App-Push an konkrete Helfer (über deren Push-Abos). Gibt die Anzahl
// erreichter Geräte zurück.
export async function sendPushToHelpers(helperIds: number[], title: string, body: string): Promise<number> {
  try {
    const ids = [...new Set((helperIds ?? []).filter(Boolean))];
    if (ids.length === 0) return 0;
    initVapid();
    const db = getDb();
    const subs = db.prepare(
      `SELECT endpoint, subscription FROM push_subscriptions WHERE helper_id IN (${ids.map(() => "?").join(",")})`
    ).all(...ids) as { endpoint: string; subscription: string }[];
    const items = parseSubs(subs);
    if (items.length === 0) return 0;
    return await deliver(items, JSON.stringify({ title, body, icon: "/icon.png" }));
  } catch {
    return 0;
  }
}
