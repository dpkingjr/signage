import { NextResponse } from "next/server";
import {
  deleteUser,
  getUser,
  passwordError,
  setAdmin,
  readProfile,
  updateUser,
  usernameError,
  usernameTaken,
} from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// An admin can't act on their own role or account here. Because only an admin
// can demote or delete another user, that guarantees one admin always remains.
async function authorize() {
  const me = await getUser();
  if (!me) return { me: null, denied: fail("Not signed in.", 401) };
  if (!me.isAdmin) return { me: null, denied: fail("Only admins can manage users.", 403) };
  return { me, denied: null };
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { me, denied } = await authorize();
  if (!me) return denied;
  const id = Number((await params).id);

  const b = await req.json().catch(() => null);
  if (typeof b?.isAdmin === "boolean") {
    if (id === me.id) return fail("You can't change your own role.", 400);
    return setAdmin(id, b.isAdmin) ? NextResponse.json({ ok: true }) : fail("User not found.", 404);
  }

  const username = typeof b?.username === "string" ? b.username.trim() : null;
  const password = typeof b?.password === "string" ? b.password : null;
  const { profile, error } = readProfile(b);
  if (error) return fail(error, 400);
  if (username === null && password === null && !profile) return fail("Nothing to change.", 400);
  if (id === me.id) return fail("You can't edit your own account here.", 400);

  // Check everything first so a bad password can't leave a half-applied edit.
  const invalid = (username !== null && usernameError(username)) || (password !== null && passwordError(password));
  if (invalid) return fail(invalid, 400);
  if (username !== null && usernameTaken(username, id)) return fail("That username is already in use.", 409);

  return updateUser(id, { username, password, profile }) ? NextResponse.json({ ok: true }) : fail("User not found.", 404);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { me, denied } = await authorize();
  if (!me) return denied;
  const id = Number((await params).id);
  if (id === me.id) return fail("You can't delete your own account.", 400);
  return deleteUser(id) ? NextResponse.json({ ok: true }) : fail("User not found.", 404);
}
