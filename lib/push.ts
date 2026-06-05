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
