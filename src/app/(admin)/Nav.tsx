"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/playlists", label: "Playlists" },
];

export default function Nav({ username, isAdmin }: { username: string; isAdmin: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const links = isAdmin ? [...LINKS, { href: "/users", label: "Users" }] : LINKS;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <Link href="/library" className="brand">Signage</Link>
      <nav className="nav">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="who">
        <Link href="/account">{username}</Link>
        <button className="btn ghost small" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
