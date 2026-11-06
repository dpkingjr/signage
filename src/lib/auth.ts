import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const SESSION_COOKIE = "signage_session";
const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
}

export interface UserListing extends User, Profile {
  createdAt: string;
}

type UserRow = { id: number; username: string; is_admin: number };
const toUser = (r: UserRow): User => ({ id: r.id, username: r.username, isAdmin: r.is_admin === 1 });

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
// Used to keep response time similar for unknown usernames.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export function hasUsers(): boolean {
  return (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c > 0;
}

export function usernameError(username: string): string | null {
  return username.length < 3 || username.length > 40 ? "Username must be 3 to 40 characters." : null;
}

export function passwordError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  // bcrypt ignores everything past 72 bytes.
  if (Buffer.byteLength(password) > 72) return "Password must be 72 bytes or fewer.";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads profile fields from a request body. All three are optional, and blank is allowed. */
export function readProfile(body: unknown): { profile?: Profile; error?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = [b.firstName, b.lastName, b.email];
  if (raw.every((v) => v === undefined)) return {};
  if (!raw.every((v) => typeof v === "string")) return { error: "Send a first name, last name and email address." };
  const [firstName, lastName, email] = raw.map((v) => (v as string).trim());
  if (firstName.length > 80 || lastName.length > 80) return { error: "Names can be up to 80 characters." };
  if (email && (email.length > 254 || !EMAIL.test(email))) return { error: "Enter a valid email address." };
  return { profile: { firstName, lastName, email } };
}

export function createUser(username: string, password: string, isAdmin = false, profile?: Profile): User {
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, is_admin, first_name, last_name, email) VALUES (?, ?, ?, ?, ?, ?)")
    .run(username, hash, isAdmin ? 1 : 0, profile?.firstName ?? "", profile?.lastName ?? "", profile?.email ?? "");
  return { id: Number(info.lastInsertRowid), username, isAdmin };
}

/** exceptId lets a user keep their own name, for example when only its capitals change. */
export function usernameTaken(username: string, exceptId = 0): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE username = ? AND id != ?").get(username, exceptId);
}

export function listUsers(): UserListing[] {
  const rows = db
    .prepare("SELECT id, username, is_admin, first_name, last_name, email, created_at FROM users ORDER BY username COLLATE NOCASE")
    .all() as (UserRow & { first_name: string; last_name: string; email: string; created_at: string })[];
  return rows.map((r) => ({
    ...toUser(r),
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
  }));
}

export function getProfile(userId: number): Profile {
  return db
    .prepare("SELECT first_name AS firstName, last_name AS lastName, email FROM users WHERE id = ?")
    .get(userId) as Profile;
}

export function setProfile(userId: number, p: Profile) {
  db.prepare("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?").run(
    p.firstName,
    p.lastName,
    p.email,
    userId
  );
}

/** Sets a new password and signs the user out everywhere. Returns false if the user doesn't exist. */
export function setPassword(userId: number, password: string): boolean {
  const hash = bcrypt.hashSync(password, 10);
  return db.transaction(() => {
    const changed = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId).changes > 0;
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    return changed;
  })();
}

/** Applies an admin's edit all at once. Returns false if the user doesn't exist. */
export function updateUser(
  userId: number,
  changes: { username?: string | null; password?: string | null; profile?: Profile }
): boolean {
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return false;
  db.transaction(() => {
    const { username, password, profile } = changes;
    if (username != null) db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
    if (profile) setProfile(userId, profile);
    if (password != null) setPassword(userId, password);
  })();
  return true;
}

export function setAdmin(userId: number, isAdmin: boolean): boolean {
  return db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, userId).changes > 0;
}

export function deleteUser(userId: number): boolean {
  return db.prepare("DELETE FROM users WHERE id = ?").run(userId).changes > 0;
}

export function verifyLogin(username: string, password: string): User | null {
  const row = db.prepare("SELECT id, username, is_admin, password_hash FROM users WHERE username = ?").get(username) as
    | (UserRow & { password_hash: string })
    | undefined;
  if (!row) {
    bcrypt.compareSync(password, DUMMY_HASH);
    return null;
  }
  return bcrypt.compareSync(password, row.password_hash) ? toUser(row) : null;
}

export async function startSession(userId: number) {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(token),
    userId,
    Date.now() + TTL_SECONDS * 1000
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(sha256(token), Date.now()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/library");
  return user;
}

// Simple in-memory limiter for sign-in attempts: 10 failures per 15 minutes per IP.
const attempts = new Map<string, { count: number; reset: number }>();
export function isBlocked(ip: string): boolean {
  const a = attempts.get(ip);
  return !!a && a.reset > Date.now() && a.count >= 10;
}
export function recordFailure(ip: string) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset <= now) attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
  else a.count++;
}
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
