/** Sends a JSON request from the browser. Returns an error message to show, or null on success. */
export async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "Something went wrong. Try again.";
  } catch {
    return "Couldn't reach the server. Try again.";
  }
}
