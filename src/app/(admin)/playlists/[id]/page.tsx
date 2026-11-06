import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db, getItems, listFolders, type ImageRow, type PlaylistRow } from "@/lib/db";
import { videoLabel } from "@/lib/format";
import PlaylistEditor from "./PlaylistEditor";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const pl = db.prepare("SELECT * FROM playlists WHERE id = ?").get(Number(id)) as PlaylistRow | undefined;
  if (!pl) notFound();

  const items = getItems(pl.id).map((i) => ({
    kind: i.kind,
    imageId: i.image_id,
    url: i.kind === "video" ? (i.video_url as string) : `/media/${i.filename}`,
    name: i.kind === "video" ? videoLabel(i.video_url as string) : (i.original_name as string),
    duration: i.duration,
    startsOn: i.starts_on,
    endsOn: i.ends_on,
  }));
  const library = (db.prepare("SELECT * FROM images ORDER BY id DESC").all() as ImageRow[]).map((r) => ({
    id: r.id,
    url: `/media/${r.filename}`,
    name: r.original_name,
    folderId: r.folder_id,
  }));

  return (
    <PlaylistEditor
      playlist={{
        id: pl.id,
        name: pl.name,
        slug: pl.slug,
        defaultDuration: pl.default_duration,
        fit: pl.fit,
        isDefault: pl.is_default === 1,
      }}
      initialItems={items}
      library={library}
      folders={listFolders()}
      canDelete={me.isAdmin}
    />
  );
}
