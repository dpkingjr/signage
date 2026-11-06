"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/format";
import { send } from "@/lib/send";

type Img = { id: number; url: string; name: string; size: number; folderId: number | null };
type Folder = { id: number; name: string };
type View = "all" | "none" | number; // every image, images in no folder, or one folder

const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`;

export default function LibraryClient({ images, folders }: { images: Img[]; folders: Folder[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [preview, setPreview] = useState<Img | null>(null);
  const previewRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (preview) previewRef.current?.showModal();
  }, [preview]);

  const current = folders.find((f) => f.id === view);
  const countIn = (folderId: number | null) => images.filter((i) => i.folderId === folderId).length;
  const visible = images.filter((i) => view === "all" || i.folderId === (view === "none" ? null : view));
  const allSelected = visible.length > 0 && visible.every((i) => selected.includes(i.id));

  function open(next: View) {
    setView(next);
    setSelected([]);
    setNaming(null);
    setErrors([]);
  }

  async function act(url: string, method: string, body?: unknown): Promise<boolean> {
    setErrors([]);
    const problem = await send(url, method, body);
    if (problem) setErrors([problem]);
    else router.refresh();
    return !problem;
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    setErrors([]);
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));
    if (current) fd.append("folderId", String(current.id));
    try {
      const res = await fetch("/api/images", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      setErrors(res.ok ? data.errors ?? [] : [data.error ?? "Upload failed."]);
      router.refresh();
    } catch {
      setErrors(["Upload failed. Check your connection and try again."]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(img: Img) {
    if (!confirm(`Delete "${img.name}"? It will also be removed from every playlist.`)) return;
    const res = await fetch(`/api/images/${img.id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected((s) => s.filter((id) => id !== img.id));
      router.refresh();
    } else setErrors([`Couldn't delete ${img.name}.`]);
  }

  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    const done =
      naming === "rename" && current
        ? await act(`/api/folders/${current.id}`, "PATCH", { name: folderName })
        : await act("/api/folders", "POST", { name: folderName });
    if (done) {
      setNaming(null);
      setFolderName("");
    }
  }

  async function deleteFolder(folder: Folder) {
    const n = countIn(folder.id);
    const detail = n > 0 ? ` ${n === 1 ? "Its image stays" : `Its ${n} images stay`} in the library, outside any folder.` : "";
    if (!confirm(`Delete folder "${folder.name}"?${detail}`)) return;
    if (await act(`/api/folders/${folder.id}`, "DELETE")) open("all");
  }

  async function moveSelected(target: string) {
    const folderId = target === "none" ? null : Number(target);
    if (await act("/api/images", "PATCH", { ids: selected, folderId })) setSelected([]);
  }

  return (
    <>
      <div className="page-head">
        <h1>Library</h1>
        <p className="muted">{images.length === 0 ? "No images yet." : plural(images.length)}</p>
      </div>

      <div
        className={`drop${dragging ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
      >
        <p>{busy ? "Uploading…" : current ? `Drop images into ${current.name}, or` : "Drop images here, or"}</p>
        <button className="btn primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose images
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <p className="muted small">JPEG, PNG, GIF, WebP or AVIF, up to 25 MB each.</p>
      </div>

      <div className="folders" role="group" aria-label="Folders">
        <button className="folder" aria-pressed={view === "all"} onClick={() => open("all")}>
          All images ({images.length})
        </button>
        <button className="folder" aria-pressed={view === "none"} onClick={() => open("none")}>
          No folder ({countIn(null)})
        </button>
        {folders.map((f) => (
          <button key={f.id} className="folder" aria-pressed={view === f.id} onClick={() => open(f.id)}>
            {f.name} ({countIn(f.id)})
          </button>
        ))}
      </div>

      <div className="folder-tools">
        <button className="btn small" onClick={() => { setNaming(naming === "new" ? null : "new"); setFolderName(""); }}>
          New folder
        </button>
        {current && (
          <>
            <button className="btn small" onClick={() => { setNaming(naming === "rename" ? null : "rename"); setFolderName(current.name); }}>
              Rename folder
            </button>
            <button className="btn small danger" onClick={() => deleteFolder(current)}>Delete folder</button>
          </>
        )}
      </div>

      {naming && (
        <form className="inline-form folder-form" onSubmit={saveFolder}>
          <label className="field grow">
            <span>{naming === "new" ? "New folder name" : `New name for ${current?.name}`}</span>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} maxLength={60} required autoFocus />
          </label>
          <button className="btn primary">{naming === "new" ? "Create folder" : "Save name"}</button>
        </form>
      )}

      {errors.length > 0 && (
        <ul className="error-list" role="alert">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {visible.length > 0 && (
        <div className="selbar">
          <label className="check">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : visible.map((i) => i.id))}
            />
            <span>{selected.length > 0 ? `${selected.length} selected` : "Select all"}</span>
          </label>
          {selected.length > 0 && (
            <select
              aria-label="Move selected images to a folder"
              value=""
              onChange={(e) => e.target.value && moveSelected(e.target.value)}
            >
              <option value="">Move to…</option>
              <option value="none">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
      )}

      {images.length > 0 && visible.length === 0 && <p className="empty">Nothing here yet.</p>}

      {visible.length > 0 && (
        <ul className="grid">
          {visible.map((img) => (
            <li key={img.id} className="tile">
              <button className="tile-open" onClick={() => setPreview(img)} aria-label={`Preview ${img.name}`}>
                <img src={img.url} alt="" loading="lazy" />
              </button>
              <label className="tile-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${img.name}`}
                  checked={selected.includes(img.id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, img.id] : s.filter((id) => id !== img.id)))
                  }
                />
              </label>
              <div className="tile-meta">
                <span className="name" title={img.name}>{img.name}</span>
                <span className="muted small">{formatBytes(img.size)}</span>
              </div>
              <button className="btn danger small" onClick={() => remove(img)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <dialog
          ref={previewRef}
          className="preview"
          aria-label={`Preview of ${preview.name}`}
          onClose={() => setPreview(null)}
          onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()} // a click on the backdrop
        >
          <img src={preview.url} alt={preview.name} />
          <div className="preview-bar">
            <div className="tile-meta">
              <span className="name" title={preview.name}>{preview.name}</span>
              <span className="muted small">{formatBytes(preview.size)}</span>
            </div>
            <button className="btn small" onClick={() => previewRef.current?.close()}>Close</button>
          </div>
        </dialog>
      )}
    </>
  );
}
