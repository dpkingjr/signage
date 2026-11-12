import { NextResponse } from "next/server";
import { createUser, hasUsers, passwordError, startSession, usernameError } from "@/lib/auth";

// Creates the first account. Refuses to run once any account exists.
export async function POST(req: Request) {
  if (await hasUsers()) return NextResponse.json({ error: "Setup is already complete." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const invalid = usernameError(username) ?? passwordError(password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const user = await createUser(username, password, true);
  await startSession(user.id);
  return NextResponse.json({ ok: true });
}
