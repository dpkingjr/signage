import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { all, get, run, transaction, type Queryable } from "./db";

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

export async function hasUsers(): Promise<boolean> {
  return !!(await get("SELECT 1 FROM users LIMIT 1"));
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

export async function createUser(username: string, password: string, isAdmin = false, profile?: Profile): Promise<User> {
  const hash = bcrypt.hashSync(password, 10);
  const info = await run(
    "INSERT INTO users (username, password_hash, is_admin, first_name, last_name, email) VALUES (?, ?, ?, ?, ?, ?)",
    [username, hash, isAdmin ? 1 : 0, profile?.firstName ?? "", profile?.lastName ?? "", profile?.email ?? ""]
  );
  return { id: info.insertId, username, isAdmin };
}

/** exceptId lets a user keep their own name, for example when only its capitals change. */
export async function usernameTaken(username: string, exceptId = 0): Promise<boolean> {
  return !!(await get("SELECT 1 FROM users WHERE username = ? AND id != ?", [username, exceptId]));
}

export async function listUsers(): Promise<UserListing[]> {
  const rows = await all<UserRow & { first_name: string; last_name: string; email: string; created_at: string }>(
    "SELECT id, username, is_admin, first_name, last_name, email, created_at FROM users ORDER BY username"
  );
  return rows.map((r) => ({
    ...toUser(r),
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
  }));
}

export async function getProfile(userId: number): Promise<Profile> {
  return (await get<Profile>("SELECT first_name AS firstName, last_name AS lastName, email FROM users WHERE id = ?", [
    userId,
  ])) as Profile;
}

export async function setProfile(userId: number, p: Profile, q?: Queryable) {
  await run("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?", [p.firstName, p.lastName, p.email, userId], q);
}

/** Sets a new password and signs the user out everywhere. Returns false if the user doesn't exist. */
export async function setPassword(userId: number, password: string, q?: Queryable): Promise<boolean> {
  const hash = bcrypt.hashSync(password, 10);
  const apply = async (c: Queryable) => {
    const changed = (await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId], c)).affectedRows > 0;
    await run("DELETE FROM sessions WHERE user_id = ?", [userId], c);
    return changed;
  };
  return q ? apply(q) : transaction(apply);
}

/** Applies an admin's edit all at once. Returns false if the user doesn't exist. */
export async function updateUser(
  userId: number,
  changes: { username?: string | null; password?: string | null; profile?: Profile }
): Promise<boolean> {
  if (!(await get("SELECT 1 FROM users WHERE id = ?", [userId]))) return false;
  await transaction(async (c) => {
    const { username, password, profile } = changes;
    if (username != null) await run("UPDATE users SET username = ? WHERE id = ?", [username, userId], c);
    if (profile) await setProfile(userId, profile, c);
    if (password != null) await setPassword(userId, password, c);
  });
  return true;
}

export async function setAdmin(userId: number, isAdmin: boolean): Promise<boolean> {
  return (await run("UPDATE users SET is_admin = ? WHERE id = ?", [isAdmin ? 1 : 0, userId])).affectedRows > 0;
}

export async function deleteUser(userId: number): Promise<boolean> {
  return (await run("DELETE FROM users WHERE id = ?", [userId])).affectedRows > 0;
}

export async function verifyLogin(username: string, password: string): Promise<User | null> {
  const row = await get<UserRow & { password_hash: string }>(
    "SELECT id, username, is_admin, password_hash FROM users WHERE username = ?",
    [username]
  );
  if (!row) {
    bcrypt.compareSync(password, DUMMY_HASH);
    return null;
  }
  return bcrypt.compareSync(password, row.password_hash) ? toUser(row) : null;
}

export async function startSession(userId: number) {
  await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    sha256(token),
    userId,
    Date.now() + TTL_SECONDS * 1000,
  ]);
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
  if (token) await run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await get<UserRow>(
    `SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [sha256(token), Date.now()]
  );
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
