import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, type FolderRow } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Enter a folder name (up to 60 characters)." }, { status: 400 });
  }
  if (db.prepare("SELECT 1 FROM folders WHERE name = ?").get(name)) {
    return NextResponse.json({ error: "A folder with that name already exists." }, { status: 409 });
  }
  const info = db.prepare("INSERT INTO folders (name) VALUES (?)").run(name);
  const folder: FolderRow = { id: Number(info.lastInsertRowid), name };
  return NextResponse.json({ folder });
}
