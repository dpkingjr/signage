"use client";

import { useState } from "react";
import type { Profile } from "@/lib/auth";
import { send } from "@/lib/send";
import ProfileFields from "../ProfileFields";

function DetailsForm({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const problem = await send("/api/account/profile", "POST", profile);
    setBusy(false);
    if (problem) setError(problem);
    else setNotice("Details saved.");
  }

  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>Your details</h2>
      <ProfileFields value={profile} onChange={setProfile} />
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="muted" role="status">{notice}</p>}
      <button className="btn primary" disabled={busy}>Save details</button>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (newPassword !== confirmPassword) return setError("New passwords don't match.");
    setBusy(true);
    const problem = await send("/api/account/password", "POST", { currentPassword, newPassword });
    setBusy(false);
    if (problem) return setError(problem);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice("Password changed. Your other devices have been signed out.");
  }

  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>Change password</h2>
      <label className="field">
        <span>Current password</span>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>New password (8 characters or more)</span>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="muted" role="status">{notice}</p>}
      <button className="btn primary" disabled={busy}>Change password</button>
    </form>
  );
}

type Props = { username: string; isAdmin: boolean; profile: Profile };

export default function AccountClient({ username, isAdmin, profile }: Props) {
  return (
    <>
      <div className="page-head">
        <h1>Your account</h1>
        <p className="muted">{username} · {isAdmin ? "Admin" : "Editor"}</p>
      </div>
      <DetailsForm initial={profile} />
      <PasswordForm />
    </>
  );
}
