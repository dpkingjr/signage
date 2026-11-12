import { NextResponse } from "next/server";
import { getItems, resolvePlayerPlaylist } from "@/lib/db";

// Public: the player calls this. GET /api/player?playlist=<slug>
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("playlist");
  const pl = await resolvePlayerPlaylist(slug);
  const headers = { "Cache-Control": "no-store" };
  if (!pl) return NextResponse.json({ error: "No playlist found." }, { status: 404, headers });
  const items = (await getItems(pl.id)).map((i) => ({
    id: i.id,
    kind: i.kind,
    url: i.kind === "video" ? i.video_url : `/media/${i.filename}`,
    duration: i.duration ?? pl.default_duration,
    startsOn: i.starts_on,
    endsOn: i.ends_on,
  }));
  return NextResponse.json({ name: pl.name, fit: pl.fit, items }, { headers });
}
