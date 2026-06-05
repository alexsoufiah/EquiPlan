import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "pferdeplan-secret-key-change-in-production"
);

export type UserRole = "admin" | "viewer" | "team" | "speaker";

export interface Session {
  role: UserRole;
  teamId?: number;
  teamName?: string;
  speakerId?: number;
  speakerName?: string;
  speakerRole?: string;
  speakerColor?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      role: payload.role as UserRole,
      teamId: payload.teamId as number | undefined,
      teamName: payload.teamName as string | undefined,
      speakerId: payload.speakerId as number | undefined,
      speakerName: payload.speakerName as string | undefined,
      speakerRole: payload.speakerRole as string | undefined,
      speakerColor: payload.speakerColor as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getPasswords(): { viewerHash: string | null; adminHash: string | null } {
  const db = getDb();
  const viewer = db.prepare("SELECT value FROM settings WHERE key = 'viewer_password'").get() as { value: string } | undefined;
  const admin = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string } | undefined;
  return { viewerHash: viewer?.value ?? null, adminHash: admin?.value ?? null };
}

export async function initDefaultPasswords() {
  const db = getDb();
  const { viewerHash, adminHash } = getPasswords();
  if (!viewerHash) {
    const hash = await hashPassword("viewer123");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('viewer_password', ?)").run(hash);
  }
  if (!adminHash) {
    const hash = await hashPassword("admin123");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)").run(hash);
  }
}
