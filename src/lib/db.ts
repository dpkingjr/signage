import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export interface ImageRow {
  id: number;
  filename: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: string;
  folder_id: number | null;
}
export interface FolderRow {
  id: number;
  name: string;
}
export interface PlaylistRow {
  id: number;
  name: string;
  slug: string;
  default_duration: number;
  fit: "contain" | "cover";
  is_default: number;
  updated_at: string;
}
export interface ItemRow {
  id: number;
  kind: "image" | "video";
  image_id: number | null;
  video_url: string | null;
  position: number;
  duration: number | null; // null = use the playlist's default
  starts_on: string | null;
  ends_on: string | null;
  filename: string | null;
  original_name: string | null;
}

// Text columns use MySQL's default utf8mb4 collation, which is case-insensitive,
// so usernames and folder names are unique regardless of capitals.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    first_name VARCHAR(80) NOT NULL DEFAULT '',
    last_name VARCHAR(80) NOT NULL DEFAULT '',
    email VARCHAR(254) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX idx_sessions_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(64) NOT NULL UNIQUE,
    original_name VARCHAR(200) NOT NULL,
    mime VARCHAR(40) NOT NULL,
    size INT NOT NULL,
    folder_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_images_folder (folder_id),
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS playlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    default_duration INT NOT NULL DEFAULT 10,
    fit VARCHAR(10) NOT NULL DEFAULT 'contain',
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS playlist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    playlist_id INT NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'image',
    image_id INT NULL,
    video_url VARCHAR(2000) NULL,
    position INT NOT NULL,
    duration INT NULL,
    starts_on DATE NULL,
    ends_on DATE NULL,
    INDEX idx_items_playlist (playlist_id, position),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
  )`,
];

/** Anything that can run a query: the pool, or a connection inside a transaction. */
export type Queryable = Pool | PoolConnection;

declare global {
  // eslint-disable-next-line no-var
  var __signagePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __signageReady: Promise<void> | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    // Outside Docker, fall back to the port compose publishes MySQL on.
    port: Number(process.env.MYSQL_PORT || process.env.MYSQL_HOST_PORT || 3306),
    user: process.env.MYSQL_USER || "signage",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "signage",
    charset: "utf8mb4",
    connectionLimit: 10,
    // Keep DATE/DATETIME as "YYYY-MM-DD[ HH:MM:SS]" strings and SUM() results as numbers.
    dateStrings: true,
    decimalNumbers: true,
    // Timestamps are UTC (compose starts MySQL with --default-time-zone=+00:00).
    timezone: "Z",
  });
}

// Reuse one pool across hot reloads in development.
const pool: Pool = globalThis.__signagePool ?? (globalThis.__signagePool = createPool());

async function init() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const conn = await pool.getConnection();
  try {
    for (const stmt of SCHEMA) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

/** Creates the tables on first use. Retries next time if MySQL wasn't reachable. */
function ready(): Promise<void> {
  globalThis.__signageReady ??= init().catch((err) => {
    globalThis.__signageReady = undefined;
    throw err;
  });
  return globalThis.__signageReady;
}

/** Returns every matching row. */
export async function all<T>(sql: string, params: unknown[] = [], q: Queryable = pool): Promise<T[]> {
  await ready();
  const [rows] = await q.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/** Returns the first matching row, or undefined. */
export async function get<T>(sql: string, params: unknown[] = [], q: Queryable = pool): Promise<T | undefined> {
  return (await all<T>(sql, params, q))[0];
}

/** Runs an INSERT/UPDATE/DELETE. Use insertId and affectedRows on the result. */
export async function run(sql: string, params: unknown[] = [], q: Queryable = pool): Promise<ResultSetHeader> {
  await ready();
  const [result] = await q.query<ResultSetHeader>(sql, params);
  return result;
}

/** Runs fn inside a transaction. Pass the connection it receives to every query inside. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  await ready();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export function listFolders(): Promise<FolderRow[]> {
  return all<FolderRow>("SELECT id, name FROM folders ORDER BY name");
}

export async function slugify(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "playlist";
  let slug = base;
  let n = 2;
  while (await get("SELECT 1 FROM playlists WHERE slug = ?", [slug])) slug = `${base}-${n++}`;
  return slug;
}

export function getItems(playlistId: number): Promise<ItemRow[]> {
  return all<ItemRow>(
    `SELECT pi.id, pi.kind, pi.image_id, pi.video_url, pi.position, pi.duration, pi.starts_on, pi.ends_on, i.filename, i.original_name
     FROM playlist_items pi LEFT JOIN images i ON i.id = pi.image_id
     WHERE pi.playlist_id = ? ORDER BY pi.position`,
    [playlistId]
  );
}

/** Playlist for the player: by slug, else the default one, else the first one. */
export async function resolvePlayerPlaylist(slug?: string | null): Promise<PlaylistRow | undefined> {
  if (slug) return get<PlaylistRow>("SELECT * FROM playlists WHERE slug = ?", [slug]);
  return (
    (await get<PlaylistRow>("SELECT * FROM playlists WHERE is_default = 1")) ??
    (await get<PlaylistRow>("SELECT * FROM playlists ORDER BY id LIMIT 1"))
  );
}
