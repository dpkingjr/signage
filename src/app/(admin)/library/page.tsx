import { requireUser } from "@/lib/auth";
import { all, listFolders, type ImageRow } from "@/lib/db";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireUser();
  const rows = await all<ImageRow>("SELECT * FROM images ORDER BY id DESC");
  const images = rows.map((r) => ({
    id: r.id,
    url: `/media/${r.filename}`,
    name: r.original_name,
    size: r.size,
    folderId: r.folder_id,
  }));
  return <LibraryClient images={images} folders={await listFolders()} />;
}
