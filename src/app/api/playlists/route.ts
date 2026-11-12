import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { get, run, slugify, type PlaylistRow } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Enter a playlist name (up to 80 characters)." }, { status: 400 });
  }
  const isFirst = !(await get("SELECT 1 FROM playlists LIMIT 1"));
  const info = await run("INSERT INTO playlists (name, slug, is_default) VALUES (?, ?, ?)", [
    name,
    await slugify(name),
    isFirst ? 1 : 0,
  ]);
  const row = await get<PlaylistRow>("SELECT * FROM playlists WHERE id = ?", [info.insertId]);
  return NextResponse.json({ playlist: row });
}
