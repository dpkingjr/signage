import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { db, UPLOAD_DIR, type ImageRow } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(Number(id)) as ImageRow | undefined;
  if (!row) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  db.prepare("DELETE FROM images WHERE id = ?").run(row.id); // cascades out of playlists
  await fs.unlink(path.join(UPLOAD_DIR, row.filename)).catch(() => {});
  return NextResponse.json({ ok: true });
}
