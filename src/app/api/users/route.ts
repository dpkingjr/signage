import { NextResponse } from "next/server";
import { createUser, getUser, passwordError, readProfile, usernameError, usernameTaken } from "@/lib/auth";

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "Only admins can manage users." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const { profile, error } = readProfile(body);
  const invalid = usernameError(username) ?? passwordError(password) ?? error;
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (await usernameTaken(username)) return NextResponse.json({ error: "That username is already in use." }, { status: 409 });

  const user = await createUser(username, password, body?.isAdmin === true, profile);
  return NextResponse.json({ user });
}
