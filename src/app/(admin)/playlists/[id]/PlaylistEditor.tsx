"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dateStatus, formatDuration, localToday, videoLabel } from "@/lib/format";

type Item = { key: number; kind: "image" | "video"; imageId: number | null; url: string; name: string; duration: number | null; startsOn: string | null; endsOn: string | null }; // null = playlist default
type Lib = { id: number; url: string; name: string; folderId: number | null };
type Props = {
  playlist: { id: number; name: string; slug: string; defaultDuration: number; fit: "contain" | "cover"; isDefault: boolean };
  initialItems: Omit<Item, "key">[];
  library: Lib[];
  folders: { id: number; name: string }[];
  canDelete: boolean;
};

const clamp = (n: number) => Math.min(3600, Math.max(1, Math.round(n) || 1));

export default function PlaylistEditor({ playlist, initialItems, library, folders, canDelete }: Props) {
  const router = useRouter();
  const nextKey = useRef(initialItems.length);
  const [name, setName] = useState(playlist.name);
  const [defaultDuration, setDefaultDuration] = useState(playlist.defaultDuration);
  const [fit, setFit] = useState(playlist.fit);
  const [isDefault, setIsDefault] = useState(playlist.isDefault);
  const [items, setItems] = useState<Item[]>(initialItems.map((it, i) => ({ ...it, key: i })));
  const seqRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null); // gap: where it would land, 0 to items.length
  const [picking, setPicking] = useState(false);
  const [pickFolder, setPickFolder] = useState("all"); // "all", "none" or a folder id
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoSecs, setVideoSecs] = useState("");
  const [videoError, setVideoError] = useState("");
  const [today, setToday] = useState(""); // set after mount so server and browser renders match
  useEffect(() => setToday(localToday()), []);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const snapshot = JSON.stringify({ name, defaultDuration, fit, isDefault, items: items.map((i) => [i.kind, i.imageId, i.url, i.duration, i.startsOn, i.endsOn]) });
  const [saved, setSaved] = useState(snapshot);
  const dirty = snapshot !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pickable = library.filter(
    (img) => pickFolder === "all" || (pickFolder === "none" ? img.folderId === null : img.folderId === Number(pickFolder))
  );
  const effective = (i: Item) => i.duration ?? clamp(defaultDuration);
  const showing = (i: Item) => !today || dateStatus(i.startsOn, i.endsOn, today) === "live";
  const total = items.reduce((s, i) => s + (showing(i) ? effective(i) : 0), 0);
  const hidden = items.filter((i) => !showing(i)).length;
  const playerPath = isDefault ? "/player" : `/player/${playlist.slug}`;

  function add(img: Lib) {
    setItems((list) => [...list, { key: nextKey.current++, kind: "image", imageId: img.id, url: img.url, name: img.name, duration: null, startsOn: null, endsOn: null }]);
  }
  function move(index: number, dir: -1 | 1) {
    setItems((list) => {
      const j = index + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  }
  // The row with the handle must stay in the DOM while a touch is held, so rows
  // only move on release. Until then a marker shows where the row will land.
  function gapAt(y: number) {
    const rows = Array.from(seqRef.current?.children ?? []);
    const i = rows.findIndex((row) => {
      const box = row.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    return i === -1 ? rows.length : i;
  }
  function startDrag(e: React.PointerEvent, from: number) {
    if (e.button !== 0) return;
    let y = e.clientY;
    const show = () => setDrag({ from, gap: gapAt(y) });
    const onMove = (ev: PointerEvent) => {
      y = ev.clientY;
      show();
    };
    const autoScroll = setInterval(() => {
      const edge = y < 80 ? -12 : y > window.innerHeight - 130 ? 12 : 0; // the bottom allows for the save bar
      if (!edge) return;
      window.scrollBy(0, edge);
      show();
    }, 16);
    const finish = (drop: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      clearInterval(autoScroll);
      setDrag(null);
      if (drop) {
        const gap = gapAt(y);
        setItems((list) => {
          const copy = [...list];
          const [moved] = copy.splice(from, 1);
          copy.splice(gap > from ? gap - 1 : gap, 0, moved);
          return copy;
        });
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    show();
  }
  const moves = drag && drag.gap !== drag.from && drag.gap !== drag.from + 1;
  const rowClass = (i: number) =>
    [
      "seq-row",
      drag?.from === i ? "dragging" : "",
      moves && drag.gap === i ? "drop-before" : "",
      moves && drag.gap === items.length && i === items.length - 1 ? "drop-after" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const setDuration = (key: number, duration: number | null) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, duration } : i)));
  const remove = (key: number) => setItems((list) => list.filter((i) => i.key !== key));

  const setDates = (key: number, patch: Partial<Pick<Item, "startsOn" | "endsOn">>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function addVideo(ev: React.FormEvent) {
    ev.preventDefault();
    const url = videoUrl.trim();
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === "http:" || u.protocol === "https:";
    } catch {}
    if (!ok) return setVideoError("Enter a full address starting with http:// or https://.");
    const secs = videoSecs.trim() === "" ? null : clamp(Number(videoSecs));
    setItems((list) => [...list, { key: nextKey.current++, kind: "video", imageId: null, url, name: videoLabel(url), duration: secs, startsOn: null, endsOn: null }]);
    setVideoUrl("");
    setVideoSecs("");
    setVideoError("");
  }

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch(`/api/playlists/${playlist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        defaultDuration: clamp(defaultDuration),
        fit,
        isDefault,
        items: items.map((i) => ({ kind: i.kind, imageId: i.imageId, videoUrl: i.kind === "video" ? i.url : null, startsOn: i.startsOn, endsOn: i.endsOn, duration: i.duration === null ? null : clamp(i.duration) })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save changes.");
    setSaved(snapshot);
    router.refresh();
  }

  async function deletePlaylist() {
    if (!confirm(`Delete "${playlist.name}"? Your images stay in the library.`)) return;
    const res = await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    if (res.ok) {
      setSaved(snapshot); // don't warn about unsaved changes
      router.push("/playlists");
      router.refresh();
    } else setError("Couldn't delete the playlist.");
  }

  return (
    <>
      <p className="crumb"><Link href="/playlists">Playlists</Link></p>
      <div className="page-head">
        <h1>{playlist.name}</h1>
        <a className="url" href={playerPath} target="_blank" rel="noreferrer">{origin}{playerPath}</a>
      </div>

      <section className="panel settings">
        <label className="field grow">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span>Default seconds per image</span>
          <input
            type="number" min={1} max={3600} inputMode="numeric" value={defaultDuration}
            onChange={(e) => setDefaultDuration(Number(e.target.value))}
            onBlur={() => setDefaultDuration(clamp(defaultDuration))}
          />
        </label>
        <label className="field">
          <span>Image fit</span>
          <select value={fit} onChange={(e) => setFit(e.target.value as "contain" | "cover")}>
            <option value="contain">Show whole image</option>
            <option value="cover">Fill the screen</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={isDefault} disabled={playlist.isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          <span>{playlist.isDefault ? "Shown at /player" : "Show this playlist at /player"}</span>
        </label>
      </section>

      <div className="section-head">
        <h2>Sequence</h2>
        <p className="muted">{items.length} image{items.length === 1 ? "" : "s"} · {formatDuration(total)} per loop today{hidden > 0 ? ` (${hidden} outside their dates)` : ""}. Images without their own time use the default.</p>
      </div>

      {items.length > 0 && (
        <div className="timeline" role="img" aria-label={`Timeline: ${items.length} images, ${formatDuration(total)} total`}>
          {items.map((it) => (
            <div
              key={it.key}
              className={`seg${it.kind === "video" ? " video" : ""}`}
              style={it.kind === "video" ? { flexGrow: effective(it) } : { flexGrow: effective(it), backgroundImage: `url(${it.url})` }}
              title={`${it.name} · ${effective(it)}s`}
            />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty">This playlist is empty. Add images from your library, or a video by its web address.</p>
      ) : (
        <ol className="seq" ref={seqRef}>
          {items.map((it, i) => (
            <li key={it.key} className={rowClass(i)}>
              <span
                className="grip"
                title="Drag to reorder"
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, i)}
                onMouseDown={(e) => e.preventDefault()}
              />
              {it.kind === "video" ? <div className="vthumb" aria-hidden="true">Video</div> : <img src={it.url} alt="" />}
              <span className="name" title={it.kind === "video" ? it.url : it.name}>{it.name}</span>
              <div className="dur">
                <input
                  type="number" min={1} max={3600} inputMode="numeric"
                  value={it.duration ?? ""}
                  placeholder={String(clamp(defaultDuration))}
                  aria-label={`Seconds on screen for ${it.name}. Leave blank to use the playlist default.`}
                  onChange={(e) => setDuration(it.key, e.target.value === "" ? null : Number(e.target.value))}
                  onBlur={() => it.duration !== null && setDuration(it.key, clamp(it.duration))}
                />
                <span>sec</span>
                {it.duration === null ? (
                  <span className="tag">Default</span>
                ) : (
                  <button className="btn small" onClick={() => setDuration(it.key, null)} aria-label={`Use playlist default for ${it.name}`}>
                    Use default
                  </button>
                )}
              </div>
              <div className="actions">
                <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${it.name} earlier`}>Up</button>
                <button className="btn small" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${it.name} later`}>Down</button>
                <button className="btn small danger" onClick={() => remove(it.key)}>Remove</button>
              </div>
              <div className="dates">
                <label className="date">
                  <span>Show from (optional)</span>
                  <input
                    type="date" value={it.startsOn ?? ""} max={it.endsOn ?? undefined}
                    onChange={(ev) => setDates(it.key, { startsOn: ev.target.value || null })}
                  />
                </label>
                <label className="date">
                  <span>Show until (optional)</span>
                  <input
                    type="date" value={it.endsOn ?? ""} min={it.startsOn ?? undefined}
                    onChange={(ev) => setDates(it.key, { endsOn: ev.target.value || null })}
                  />
                </label>
                <button
                  className="btn small"
                  onClick={() => setDates(it.key, { startsOn: null, endsOn: null })}
                  disabled={!it.startsOn && !it.endsOn}
                  aria-label={`Clear dates for ${it.name}`}
                >
                  Clear dates
                </button>
                {today && dateStatus(it.startsOn, it.endsOn, today) === "upcoming" && <span className="tag">Not started</span>}
                {today && dateStatus(it.startsOn, it.endsOn, today) === "ended" && <span className="tag">Ended</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="toolbar">
        <button className="btn" onClick={() => setPicking((p) => !p)}>{picking ? "Close library" : "Add images"}</button>
        <button className="btn" onClick={() => setAddingVideo((v) => !v)}>{addingVideo ? "Close video form" : "Add video"}</button>
        {items.length > 0 && (
          <button className="btn" onClick={() => setItems((l) => l.map((i) => ({ ...i, duration: null })))}
                  disabled={items.every((i) => i.duration === null)}>
            Reset all to default ({clamp(defaultDuration)}s)
          </button>
        )}
      </div>

      {addingVideo && (
        <form className="panel video-form" onSubmit={addVideo}>
          <label className="field grow">
            <span>Video address</span>
            <input type="url" value={videoUrl} onChange={(ev) => setVideoUrl(ev.target.value)} placeholder="https://example.com/clip.mp4" required />
          </label>
          <label className="field">
            <span>Seconds on screen</span>
            <input
              type="number" min={1} max={3600} inputMode="numeric" value={videoSecs} placeholder={String(clamp(defaultDuration))}
              onChange={(ev) => setVideoSecs(ev.target.value)}
            />
          </label>
          <button className="btn primary">Add to sequence</button>
          <p className="muted small video-note">
            Use a direct link to a video file (MP4 or WebM). Leave seconds blank to use the playlist default. The video plays without sound; a clip shorter than its time repeats, and a longer one is cut off.
          </p>
          {videoError && <p className="error" role="alert">{videoError}</p>}
        </form>
      )}

      {picking && (
        <section className="panel">
          {library.length === 0 ? (
            <p className="empty">The library is empty. <Link href="/library">Upload images</Link> first.</p>
          ) : (
            <>
              <p className="muted small">Select an image to add it to the end of the sequence. You can add the same image more than once.</p>
              {folders.length > 0 && (
                <label className="field picker-folder">
                  <span>Folder</span>
                  <select value={pickFolder} onChange={(e) => setPickFolder(e.target.value)}>
                    <option value="all">All images</option>
                    <option value="none">No folder</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              )}
              {pickable.length === 0 && <p className="empty">No images here.</p>}
              <ul className="grid picker">
                {pickable.map((img) => {
                  const uses = items.filter((i) => i.imageId === img.id).length;
                  return (
                    <li key={img.id}>
                      <button className="pick" onClick={() => add(img)} title={img.name}>
                        <img src={img.url} alt={img.name} loading="lazy" />
                        {uses > 0 && <span className="badge on-img">×{uses}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="savebar">
        <span className="muted">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
        {canDelete && <button className="btn danger ghost" onClick={deletePlaylist}>Delete playlist</button>}
        <button className="btn primary" onClick={save} disabled={busy || !dirty || !name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}
