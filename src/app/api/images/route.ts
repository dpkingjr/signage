import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { db, UPLOAD_DIR, type ImageRow } from "@/lib/db";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET() {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const rows = db.prepare("SELECT * FROM images ORDER BY id DESC").all() as ImageRow[];
  return NextResponse.json({ images: rows });
}

// Moves images into a folder, or out of all folders when folderId is null.
export async function PATCH(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => null);
  const ids: unknown = b?.ids;
  const folderId: unknown = b?.folderId;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isInteger)) {
    return NextResponse.json({ error: "Choose at least one image." }, { status: 400 });
  }
  if (folderId !== null && !(Number.isInteger(folderId) && db.prepare("SELECT 1 FROM folders WHERE id = ?").get(folderId))) {
    return NextResponse.json({ error: "That folder no longer exists." }, { status: 400 });
  }
  const move = db.prepare("UPDATE images SET folder_id = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id) => move.run(folderId, id)))();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });

  const rawFolder = form.get("folderId");
  const folderId = rawFolder ? Number(rawFolder) : null;
  if (folderId !== null && !db.prepare("SELECT 1 FROM folders WHERE id = ?").get(folderId)) {
    return NextResponse.json({ error: "That folder no longer exists." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  const errors: string[] = [];
  let added = 0;

  for (const file of files) {
    const ext = EXT[file.type];
    if (!ext) {
      errors.push(`${file.name}: only JPEG, PNG, GIF, WebP and AVIF images are supported.`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: larger than 25 MB.`);
      continue;
    }
    const filename = `${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));
    db.prepare("INSERT INTO images (filename, original_name, mime, size, folder_id) VALUES (?, ?, ?, ?, ?)").run(
      filename,
      file.name.slice(0, 200),
      file.type,
      file.size,
      folderId
    );
    added++;
  }
  return NextResponse.json({ added, errors });
}
