export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return r ? `${m}m ${r}s` : `${m}m`;
  return `${r}s`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A readable label for a video address: its file name, or the host if there isn't one. */
export function videoLabel(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last || u.hostname;
  } catch {
    return url;
  }
}

/** Today's date on this device, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Start and end dates are inclusive; either may be empty for "no limit". */
export function dateStatus(startsOn: string | null, endsOn: string | null, today: string): "live" | "upcoming" | "ended" {
  if (startsOn && today < startsOn) return "upcoming";
  if (endsOn && today > endsOn) return "ended";
  return "live";
}
