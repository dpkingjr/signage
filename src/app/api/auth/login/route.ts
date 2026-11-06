import { NextResponse } from "next/server";
import { clientIp, isBlocked, recordFailure, startSession, verifyLogin } from "@/lib/auth";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const user = verifyLogin(username, password);
  if (!user) {
    recordFailure(ip);
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  await startSession(user.id);
  return NextResponse.json({ ok: true });
}
