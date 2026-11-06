import { requireUser } from "@/lib/auth";
import { db, type PlaylistRow } from "@/lib/db";
import PlaylistsClient from "./PlaylistsClient";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const me = await requireUser();
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(pi.id) AS item_count, COALESCE(SUM(COALESCE(pi.duration, p.default_duration)), 0) AS total_seconds
       FROM playlists p LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
       GROUP BY p.id ORDER BY p.is_default DESC, p.name COLLATE NOCASE`
    )
    .all() as (PlaylistRow & { item_count: number; total_seconds: number })[];
  const playlists = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isDefault: r.is_default === 1,
    count: r.item_count,
    seconds: r.total_seconds,
  }));
  return <PlaylistsClient playlists={playlists} isAdmin={me.isAdmin} />;
}
