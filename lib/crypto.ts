import crypto from "crypto";

// Symmetrische Verschlüsselung für „at rest"-Geheimnisse (z. B. generierte
// Helfer-Passwörter). Schlüssel aus Umgebungsvariable; bei einem DB-/Backup-Leak
// sind die Werte ohne den Schlüssel nicht lesbar. Rückwärtskompatibel:
// Werte ohne PREFIX gelten als Alt-Klartext und werden unverändert zurückgegeben.

const SECRET =
  process.env.HELPER_PW_SECRET ||
  process.env.JWT_SECRET ||
  "pferdeplan-secret-key-change-in-production";

const KEY = crypto.createHash("sha256").update(SECRET).digest(); // 32 Byte
const PREFIX = "enc:v1:";

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // Alt-Klartext (vor der Umstellung)
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
