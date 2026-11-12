"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes, formatName } from "@/lib/format";
import { send } from "@/lib/send";

type Img = { id: number; url: string; name: string; size: number; mime: string; folderId: number | null };
type Folder = { id: number; name: string };
type View = "all" | "none" | number; // every image, images in no folder, or one folder

// Drag data type for images dragged within the page, so drops can tell them apart from uploaded files.
const IMAGE_DRAG = "application/x-signage-images";
const hasType = (e: React.DragEvent, type: string) => Array.from(e.dataTransfer.types).includes(type);

const PAGE_SIZE = 24; // divides evenly into 2, 3, 4 and 6 columns

const plural = (n: number) => `${n} image${n === 1 ? "" : "s"}`;

export default function LibraryClient({ images, folders }: { images: Img[]; folders: Folder[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<View>("all");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [preview, setPreview] = useState<Img | null>(null);
  const [draggingIds, setDraggingIds] = useState<number[]>([]); // images being dragged to a folder
  const [dropTarget, setDropTarget] = useState<"none" | number | null>(null); // folder chip under the pointer
  const previewRef = useRef<HTMLDialogElement>(null);
  // Pixel size of the previewed image, read once it has loaded.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setDims(null);
    if (preview) previewRef.current?.showModal();
  }, [preview]);

  const current = folders.find((f) => f.id === view);
  const countIn = (folderId: number | null) => images.filter((i) => i.folderId === folderId).length;
  const inView = images.filter((i) => view === "all" || i.folderId === (view === "none" ? null : view));
  const pageCount = Math.max(1, Math.ceil(inView.length / PAGE_SIZE));
  const pageNow = Math.min(page, pageCount); // stays in range when images are deleted or moved away
  const first = (pageNow - 1) * PAGE_SIZE;
  const visible = inView.slice(first, first + PAGE_SIZE);
  const allSelected = visible.length > 0 && visible.every((i) => selected.includes(i.id));

  useEffect(() => {
    if (page !== pageNow) setPage(pageNow);
  }, [page, pageNow]);

  function goTo(n: number) {
    setPage(n);
    setSelected([]);
    gridRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function open(next: View) {
    setView(next);
    setPage(1);
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

  // Dragging a ticked image moves every ticked image; dragging any other image moves just that one.
  function startDrag(e: React.DragEvent, img: Img) {
    const ids = selected.includes(img.id) ? selected : [img.id];
    e.dataTransfer.setData(IMAGE_DRAG, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
    setDraggingIds(ids);
  }

  function endDrag() {
    setDraggingIds([]);
    setDropTarget(null);
  }

  /** Props that make a folder chip accept dragged images. target "none" means out of every folder. */
  function folderDrop(target: "none" | number) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!hasType(e, IMAGE_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(target);
      },
      onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
      onDrop: async (e: React.DragEvent) => {
        if (!hasType(e, IMAGE_DRAG)) return;
        e.preventDefault();
        endDrag();
        let ids: number[] = [];
        try {
          ids = JSON.parse(e.dataTransfer.getData(IMAGE_DRAG));
        } catch {
          return;
        }
        const folderId = target === "none" ? null : target;
        const toMove = ids.filter((id) => images.find((i) => i.id === id)?.folderId !== folderId);
        if (!toMove.length) return;
        if (await act("/api/images", "PATCH", { ids: toMove, folderId })) {
          setSelected((s) => s.filter((id) => !ids.includes(id)));
        }
      },
    };
  }

  const chipClass = (target: "none" | number) => `folder${dropTarget === target ? " drop-target" : ""}`;

  return (
    <>
      <div className="page-head">
        <h1>Library</h1>
        <p className="muted">{images.length === 0 ? "No images yet." : plural(images.length)}</p>
      </div>

      <div className="library">
        <aside className="lib-side">
          <h2 className="side-title" id="folders-title">Folders</h2>
          <div className="folders" role="group" aria-labelledby="folders-title">
            <button className="folder" aria-pressed={view === "all"} onClick={() => open("all")}>
              <span className="folder-name">All images</span> <span className="folder-count">{images.length}</span>
            </button>
            <button className={chipClass("none")} aria-pressed={view === "none"} onClick={() => open("none")} {...folderDrop("none")}>
              <span className="folder-name">No folder</span> <span className="folder-count">{countIn(null)}</span>
            </button>
            {folders.map((f) => (
              <button key={f.id} className={chipClass(f.id)} aria-pressed={view === f.id} onClick={() => open(f.id)} {...folderDrop(f.id)}>
                <span className="folder-name">{f.name}</span> <span className="folder-count">{countIn(f.id)}</span>
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
        </aside>

        <div className="lib-main">
          <div
            className={`drop${dragging ? " over" : ""}`}
            onDragOver={(e) => { if (!hasType(e, "Files")) return; e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { if (!hasType(e, "Files")) return; e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
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



          {errors.length > 0 && (
            <ul className="error-list" role="alert">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {visible.length > 0 && (
            <div className="selbar" ref={gridRef}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : visible.map((i) => i.id))}
                />
                <span>
                  {selected.length > 0 ? `${selected.length} selected` : pageCount > 1 ? "Select all on this page" : "Select all"}
                </span>
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
                <li
                  key={img.id}
                  className={`tile${draggingIds.includes(img.id) ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => startDrag(e, img)}
                  onDragEnd={endDrag}
                >
                  <button className="tile-open" onClick={() => setPreview(img)} aria-label={`Preview ${img.name}`}>
                    <img src={img.url} alt="" loading="lazy" draggable={false} />
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

          {pageCount > 1 && (
            <nav className="pager" aria-label="Library pages">
              <button className="btn small" disabled={pageNow === 1} onClick={() => goTo(pageNow - 1)}>
                Previous
              </button>
              <span className="muted small" aria-live="polite">
                Page {pageNow} of {pageCount} · {first + 1}–{first + visible.length} of {inView.length}
              </span>
              <button className="btn small" disabled={pageNow === pageCount} onClick={() => goTo(pageNow + 1)}>
                Next
              </button>
            </nav>
          )}
        </div>
      </div>

      {preview && (
        <dialog
          ref={previewRef}
          className="preview"
          aria-label={`Preview of ${preview.name}`}
          onClose={() => setPreview(null)}
          onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()} // a click on the backdrop
        >
          <img
            src={preview.url}
            alt={preview.name}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          <div className="preview-bar">
            <div className="tile-meta">
              <span className="name" title={preview.name}>{preview.name}</span>
              <span className="muted small">
                {[dims && `${dims.w} × ${dims.h} px`, formatName(preview.mime), formatBytes(preview.size)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button className="btn small" onClick={() => previewRef.current?.close()}>Close</button>
          </div>
        </dialog>
      )}
    </>
  );
}
