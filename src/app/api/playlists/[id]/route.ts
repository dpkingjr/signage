import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, type PlaylistRow } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 2000) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const isSeconds = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 3600;

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pid = Number((await params).id);
  const pl = db.prepare("SELECT * FROM playlists WHERE id = ?").get(pid) as PlaylistRow | undefined;
  if (!pl) return NextResponse.json({ error: "Playlist not found." }, { status: 404 });

  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  if (!name || name.length > 80) return bad("Enter a playlist name (up to 80 characters).");
  if (!isSeconds(b?.defaultDuration)) return bad("Default time must be between 1 and 3600 seconds.");
  if (b?.fit !== "contain" && b?.fit !== "cover") return bad("Fit must be contain or cover.");
  if (!Array.isArray(b?.items)) return bad("Items must be a list.");
  for (const it of b.items) {
    if (it?.kind === "video") {
      if (!isHttpUrl(it?.videoUrl)) return bad("Video addresses must start with http:// or https://.");
    } else if (!Number.isInteger(it?.imageId)) return bad("Each item needs an image.");
    if (it?.duration !== null && !isSeconds(it?.duration)) return bad("Each image's time must be between 1 and 3600 seconds, or blank to use the playlist default.");
    const s = it?.startsOn || null;
    const e = it?.endsOn || null;
    if ((s !== null && !isDay(s)) || (e !== null && !isDay(e))) return bad("Start and end dates must be valid dates.");
    if (s && e && e < s) return bad("An entry's end date can't be before its start date.");
  }

  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE playlists SET name = ?, default_duration = ?, fit = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(name, b.defaultDuration, b.fit, pid);
      if (b.isDefault === true) {
        db.prepare("UPDATE playlists SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END").run(pid);
      }
      db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(pid);
      const ins = db.prepare(
        "INSERT INTO playlist_items (playlist_id, kind, image_id, video_url, position, duration, starts_on, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      (
        b.items as {
          kind?: string;
          imageId: number | null;
          videoUrl?: string;
          duration: number | null;
          startsOn?: string | null;
          endsOn?: string | null;
        }[]
      ).forEach((it, i) => {
        const s = it.startsOn || null;
        const e = it.endsOn || null;
        if (it.kind === "video") ins.run(pid, "video", null, it.videoUrl, i, it.duration, s, e);
        else ins.run(pid, "image", it.imageId, null, i, it.duration, s, e);
      });
    })();
  } catch {
    return bad("One of the images no longer exists. Reload the page and try again.");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "Only admins can delete playlists." }, { status: 403 });
  const pid = Number((await params).id);
  db.transaction(() => {
    db.prepare("DELETE FROM playlists WHERE id = ?").run(pid);
    if (!db.prepare("SELECT 1 FROM playlists WHERE is_default = 1").get()) {
      db.prepare("UPDATE playlists SET is_default = 1 WHERE id = (SELECT MIN(id) FROM playlists)").run();
    }
  })();
  return NextResponse.json({ ok: true });
}
