"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dateStatus, localToday } from "@/lib/format";

type Item = { id: number; kind: "image" | "video"; url: string; duration: number; startsOn: string | null; endsOn: string | null };
type Data = { name: string; fit: "contain" | "cover"; items: Item[] };
type Layer = { n: number; kind: "image" | "video"; url: string };

const POLL_MS = 30_000;
const FADE_MS = 900;

export default function Player({ slug }: { slug?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "offline">("loading");
  const [index, setIndex] = useState(0);
  const [layers, setLayers] = useState<Layer[]>([]);
  const counter = useRef(0);
  const lastSig = useRef("");
  const [today, setToday] = useState(localToday);

  // Notice when the date rolls over so entries start and stop on time.
  useEffect(() => {
    const t = setInterval(() => setToday(localToday()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Load the playlist now, then re-check every 30 s so edits appear on their own.
  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch(`/api/player${slug ? `?playlist=${encodeURIComponent(slug)}` : ""}`, { cache: "no-store" });
        if (stop) return;
        if (res.status === 404) {
          setData(null);
          lastSig.current = "";
          return setStatus("missing");
        }
        const json = (await res.json()) as Data;
        const sig = JSON.stringify(json);
        if (sig !== lastSig.current) {
          lastSig.current = sig;
          setData(json);
          setIndex(0);
        }
        setStatus("ready");
      } catch {
        if (!stop) setStatus((s) => (s === "ready" ? s : "offline")); // keep playing if the network drops
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug]);

  // Show the current image, preload the next one, advance after its duration.
  const items = useMemo(
    () => (data?.items ?? []).filter((i) => dateStatus(i.startsOn, i.endsOn, today) === "live"),
    [data, today]
  );
  useEffect(() => {
    if (!items.length) {
      setLayers([]);
      return;
    }
    const i = index % items.length;
    const item = items[i];
    setLayers((l) => [...l.slice(-1), { n: counter.current++, kind: item.kind, url: item.url }]);
    const cleanup = setTimeout(() => setLayers((l) => l.slice(-1)), FADE_MS + 100);
    const upcoming = items[(i + 1) % items.length];
    if (items.length > 1 && upcoming.kind === "image") new Image().src = upcoming.url;
    const next = setTimeout(() => setIndex((x) => (x + 1) % items.length), item.duration * 1000);
    return () => {
      clearTimeout(cleanup);
      clearTimeout(next);
    };
  }, [index, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen awake where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {}
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const message =
    status === "loading" ? null
    : status === "missing" ? "This playlist doesn't exist."
    : status === "offline" ? "Can't reach the server. Retrying…"
    : items.length === 0 ? ((data?.items.length ?? 0) > 0 ? "Nothing is scheduled for today." : "Nothing to show yet. Add images to this playlist.")
    : null;

  return (
    <div className="player" onClick={toggleFullscreen}>
      {layers.map((l) =>
        l.kind === "video" ? (
          <video
            key={l.n}
            src={l.url}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            style={{ objectFit: data?.fit ?? "contain" }}
            onError={() => {
              // Couldn't load this video: move on after a few seconds instead of sitting on black.
              setTimeout(() => {
                if (counter.current - 1 === l.n) setIndex((x) => x + 1);
              }, 3000);
            }}
          />
        ) : (
          <img key={l.n} src={l.url} alt="" draggable={false} style={{ objectFit: data?.fit ?? "contain" }} />
        )
      )}
      {message && <p className="player-msg">{message}</p>}
    </div>
  );
}
