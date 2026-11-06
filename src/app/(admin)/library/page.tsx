import { requireUser } from "@/lib/auth";
import { db, listFolders, type ImageRow } from "@/lib/db";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireUser();
  const rows = db.prepare("SELECT * FROM images ORDER BY id DESC").all() as ImageRow[];
  const images = rows.map((r) => ({
    id: r.id,
    url: `/media/${r.filename}`,
    name: r.original_name,
    size: r.size,
    folderId: r.folder_id,
  }));
  return <LibraryClient images={images} folders={listFolders()} />;
}
