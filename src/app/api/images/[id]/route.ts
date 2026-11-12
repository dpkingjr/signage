import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { get, run, UPLOAD_DIR, type ImageRow } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const row = await get<ImageRow>("SELECT * FROM images WHERE id = ?", [Number(id)]);
  if (!row) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  await run("DELETE FROM images WHERE id = ?", [row.id]); // cascades out of playlists
  await fs.unlink(path.join(UPLOAD_DIR, row.filename)).catch(() => {});
  return NextResponse.json({ ok: true });
}
