import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Enter a folder name (up to 60 characters)." }, { status: 400 });
  }
  if (db.prepare("SELECT 1 FROM folders WHERE name = ? AND id != ?").get(name, id)) {
    return NextResponse.json({ error: "A folder with that name already exists." }, { status: 409 });
  }
  const { changes } = db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(name, id);
  if (!changes) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// The images stay in the library; the foreign key moves them out of the folder.
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await getUser())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = Number((await params).id);
  const { changes } = db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  if (!changes) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
