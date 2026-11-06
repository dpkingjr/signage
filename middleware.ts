import { NextResponse, type NextRequest } from "next/server";

// Only these paths are reachable without signing in.
const PUBLIC = [
  /^\/player(\/|$)/,
  /^\/api\/player(\/|$)/,
  /^\/media\//,
  /^\/login$/,
  /^\/api\/auth\//,
];

// Cheap first gate: no session cookie means no access.
// Every page and API route still verifies the session against the database.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.get("signage_session")?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
