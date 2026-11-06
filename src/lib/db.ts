import Database from "better-sqlite3";
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

declare global {
  // eslint-disable-next-line no-var
  var __signageDb: Database.Database | undefined;
}

function init(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const conn = new Database(path.join(DATA_DIR, "signage.db"));
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      default_duration INTEGER NOT NULL DEFAULT 10,
      fit TEXT NOT NULL DEFAULT 'contain',
      is_default INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'image',
      image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
      video_url TEXT,
      position INTEGER NOT NULL,
      duration INTEGER,
      starts_on TEXT,
      ends_on TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_items_playlist ON playlist_items(playlist_id, position);
  `);
  // Accounts from before roles existed could already do everything, so they become admins.
  const userCols = (conn.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes("is_admin")) {
    conn.transaction(() => {
      conn.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
      conn.exec("UPDATE users SET is_admin = 1");
    })();
  }
  // Accounts from before these details existed start with them blank.
  for (const c of ["first_name", "last_name", "email"]) {
    if (!userCols.includes(c)) conn.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT NOT NULL DEFAULT ''`);
  }
  // Images from before folders existed start outside any folder.
  const imageCols = (conn.prepare("PRAGMA table_info(images)").all() as { name: string }[]).map((c) => c.name);
  if (!imageCols.includes("folder_id")) {
    conn.exec("ALTER TABLE images ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL");
  }
  conn.exec("CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_id)");
  // Older databases: rebuild playlist_items so it can hold video entries and optional durations.
  const cols = (conn.prepare("PRAGMA table_info(playlist_items)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("kind")) {
    conn.exec(`
      BEGIN;
      CREATE TABLE playlist_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'image',
        image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
        video_url TEXT,
        position INTEGER NOT NULL,
        duration INTEGER
      );
      INSERT INTO playlist_items_new (id, playlist_id, kind, image_id, position, duration)
        SELECT id, playlist_id, 'image', image_id, position, duration FROM playlist_items;
      DROP TABLE playlist_items;
      ALTER TABLE playlist_items_new RENAME TO playlist_items;
      CREATE INDEX IF NOT EXISTS idx_items_playlist ON playlist_items(playlist_id, position);
      COMMIT;
    `);
  }
  // Add the date-range columns to databases created before they existed.
  const cols2 = (conn.prepare("PRAGMA table_info(playlist_items)").all() as { name: string }[]).map((c) => c.name);
  for (const c of ["starts_on", "ends_on"]) {
    if (!cols2.includes(c)) conn.exec(`ALTER TABLE playlist_items ADD COLUMN ${c} TEXT`);
  }
  return conn;
}

export const db: Database.Database = globalThis.__signageDb ?? (globalThis.__signageDb = init());

export function listFolders(): FolderRow[] {
  return db.prepare("SELECT id, name FROM folders ORDER BY name COLLATE NOCASE").all() as FolderRow[];
}

export function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "playlist";
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 FROM playlists WHERE slug = ?").get(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function getItems(playlistId: number): ItemRow[] {
  return db
    .prepare(
      `SELECT pi.id, pi.kind, pi.image_id, pi.video_url, pi.position, pi.duration, pi.starts_on, pi.ends_on, i.filename, i.original_name
       FROM playlist_items pi LEFT JOIN images i ON i.id = pi.image_id
       WHERE pi.playlist_id = ? ORDER BY pi.position`
    )
    .all(playlistId) as ItemRow[];
}

/** Playlist for the player: by slug, else the default one, else the first one. */
export function resolvePlayerPlaylist(slug?: string | null): PlaylistRow | undefined {
  if (slug) return db.prepare("SELECT * FROM playlists WHERE slug = ?").get(slug) as PlaylistRow | undefined;
  return (
    (db.prepare("SELECT * FROM playlists WHERE is_default = 1").get() as PlaylistRow | undefined) ??
    (db.prepare("SELECT * FROM playlists ORDER BY id LIMIT 1").get() as PlaylistRow | undefined)
  );
}
