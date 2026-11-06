import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, slugify, type PlaylistRow } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Enter a playlist name (up to 80 characters)." }, { status: 400 });
  }
  const isFirst = !db.prepare("SELECT 1 FROM playlists LIMIT 1").get();
  const info = db
    .prepare("INSERT INTO playlists (name, slug, is_default) VALUES (?, ?, ?)")
    .run(name, slugify(name), isFirst ? 1 : 0);
  const row = db.prepare("SELECT * FROM playlists WHERE id = ?").get(info.lastInsertRowid) as PlaylistRow;
  return NextResponse.json({ playlist: row });
}
