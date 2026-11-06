import { NextResponse } from "next/server";
import {
  clientIp,
  getUser,
  isBlocked,
  passwordError,
  recordFailure,
  setPassword,
  startSession,
  verifyLogin,
} from "@/lib/auth";

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const current = String(body?.currentPassword ?? "");
  const next = String(body?.newPassword ?? "");
  if (!verifyLogin(me.username, current)) {
    recordFailure(ip);
    return NextResponse.json({ error: "Your current password is wrong." }, { status: 400 });
  }
  const invalid = passwordError(next);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  setPassword(me.id, next);
  await startSession(me.id); // setPassword ended every session, including this one.
  return NextResponse.json({ ok: true });
}
