import { NextResponse } from "next/server";
import { getUser, readProfile, setProfile } from "@/lib/auth";

// Always changes the signed-in user. Admins edit other people from /api/users/:id.
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { profile, error } = readProfile(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!profile) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await setProfile(me.id, profile);
  return NextResponse.json({ ok: true });
}
