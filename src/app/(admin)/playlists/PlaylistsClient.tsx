"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/format";
import { send } from "@/lib/send";

type P = { id: number; name: string; slug: string; isDefault: boolean; count: number; seconds: number };

export default function PlaylistsClient({ playlists, isAdmin }: { playlists: P[]; isAdmin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't create the playlist.");
    router.push(`/playlists/${data.playlist.id}`);
  }

  async function remove(p: P) {
    const live = !p.isDefault
      ? ""
      : playlists.length > 1
        ? " It's the one shown at /player, so another playlist will take its place."
        : " It's the one shown at /player, so screens there will have nothing to show.";
    if (!confirm(`Delete "${p.name}"?${live} Your images stay in the library.`)) return;
    setError("");
    const problem = await send(`/api/playlists/${p.id}`, "DELETE");
    if (problem) setError(problem);
    else router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>Playlists</h1>
        <p className="muted">Each playlist has its own player address.</p>
      </div>

      <form className="inline-form" onSubmit={create}>
        <label className="field grow">
          <span>New playlist name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Front window" required />
        </label>
        <button className="btn primary" disabled={busy}>Create playlist</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {playlists.length === 0 ? (
        <p className="empty">Create your first playlist, then add images from your library.</p>
      ) : (
        <ul className="rows">
          {playlists.map((p) => {
            const path = p.isDefault ? "/player" : `/player/${p.slug}`;
            return (
              <li key={p.id} className="row-card">
                <div className="row-main">
                  <Link href={`/playlists/${p.id}`} className="row-title">{p.name}</Link>
                  {p.isDefault && <span className="badge">Default</span>}
                  <p className="muted small">
                    {p.count} image{p.count === 1 ? "" : "s"} · {formatDuration(p.seconds)} per loop
                  </p>
                  <a className="url" href={path} target="_blank" rel="noreferrer">{origin}{path}</a>
                </div>
                <div className="row-actions">
                  <Link href={`/playlists/${p.id}`} className="btn small">Edit</Link>
                  {isAdmin && <button className="btn small danger" onClick={() => remove(p)}>Delete</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
