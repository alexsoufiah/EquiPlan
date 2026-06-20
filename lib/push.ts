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

export async function sendPushNotification(title: string, body: string) {
  initVapid();
  const db = getDb();
  const subs = db.prepare("SELECT subscription FROM push_subscriptions").all() as { subscription: string }[];

  const payload = JSON.stringify({ title, body, icon: "/icon.png" });

  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(JSON.parse(s.subscription), payload))
  );

  // Remove expired subscriptions
  const expiredEndpoints: string[] = [];
  subs.forEach((s, i) => {
    const result = results[i];
    if (result.status === "rejected") {
      const sub = JSON.parse(s.subscription);
      expiredEndpoints.push(sub.endpoint);
    }
  });
  if (expiredEndpoints.length > 0) {
    const del = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
    expiredEndpoints.forEach((ep) => del.run(ep));
  }
}

// Gezielte Benachrichtigung: nur an die zugewiesenen Teams + den Sprecher.
// Admins werden bewusst NICHT benachrichtigt (sie lösen die Änderung selbst aus).
export async function sendTargetedPush(
  targets: { teamIds?: number[]; speakerId?: number | null },
  title: string,
  body: string,
) {
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
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, icon: "/icon.png" });
  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(JSON.parse(s.subscription), payload))
  );

  const del = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
  subs.forEach((s, i) => { if (results[i].status === "rejected") del.run(s.endpoint); });
}

// Gezielte App-Push an konkrete Helfer (über deren Push-Abos). Gibt die Anzahl
// erreichter Geräte zurück.
export async function sendPushToHelpers(helperIds: number[], title: string, body: string): Promise<number> {
  const ids = [...new Set((helperIds ?? []).filter(Boolean))];
  if (ids.length === 0) return 0;
  initVapid();
  const db = getDb();
  const subs = db.prepare(
    `SELECT endpoint, subscription FROM push_subscriptions WHERE helper_id IN (${ids.map(() => "?").join(",")})`
  ).all(...ids) as { endpoint: string; subscription: string }[];
  if (subs.length === 0) return 0;

  const payload = JSON.stringify({ title, body, icon: "/icon.png" });
  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(JSON.parse(s.subscription), payload))
  );
  const del = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
  let ok = 0;
  subs.forEach((s, i) => { if (results[i].status === "rejected") del.run(s.endpoint); else ok++; });
  return ok;
}
