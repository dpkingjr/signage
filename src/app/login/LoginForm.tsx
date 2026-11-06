"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ setup }: { setup: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (setup && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push("/library");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel login" onSubmit={submit}>
      <h1>{setup ? "Create your admin account" : "Sign in"}</h1>
      {setup && <p className="muted">This account manages all images and playlists. You only do this once.</p>}
      <label className="field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        <span>Password{setup ? " (8 characters or more)" : ""}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={setup ? "new-password" : "current-password"}
          required
        />
      </label>
      {setup && (
        <label className="field">
          <span>Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Please wait…" : setup ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
