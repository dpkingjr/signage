"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserListing } from "@/lib/auth";
import { send } from "@/lib/send";
import ProfileFields, { BLANK_PROFILE } from "../ProfileFields";

const details = (u: UserListing) =>
  [[u.firstName, u.lastName].filter(Boolean).join(" "), u.email].filter(Boolean).join(" · ");

export default function UsersClient({ users, meId }: { users: UserListing[]; meId: number }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState(BLANK_PROFILE);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editProfile, setEditProfile] = useState(BLANK_PROFILE);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(url: string, method: string, body: unknown, done: string): Promise<boolean> {
    setError("");
    setNotice("");
    setBusy(true);
    const problem = await send(url, method, body);
    setBusy(false);
    if (problem) {
      setError(problem);
      return false;
    }
    setNotice(done);
    router.refresh();
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await run("/api/users", "POST", { username, password, isAdmin, ...profile }, `Added ${username}.`)) {
      setUsername("");
      setPassword("");
      setIsAdmin(false);
      setProfile(BLANK_PROFILE);
    }
  }

  function toggleEdit(u: UserListing) {
    setEditId(editId === u.id ? null : u.id);
    setEditName(u.username);
    setEditPassword("");
    setEditProfile({ firstName: u.firstName, lastName: u.lastName, email: u.email });
  }

  async function saveEdit(e: React.FormEvent, u: UserListing) {
    e.preventDefault();
    const body = { username: editName, ...editProfile, ...(editPassword ? { password: editPassword } : {}) };
    const done = editPassword ? `Saved ${editName}. They've been signed out.` : `Saved ${editName}.`;
    if (await run(`/api/users/${u.id}`, "PATCH", body, done)) setEditId(null);
  }

  function remove(u: UserListing) {
    if (!confirm(`Delete "${u.username}"? They'll be signed out right away.`)) return;
    run(`/api/users/${u.id}`, "DELETE", undefined, `Deleted ${u.username}.`);
  }

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <p className="muted">Editors manage images and playlists. Admins can also delete playlists and manage users.</p>
      </div>

      <form className="inline-form" onSubmit={create}>
        <label className="field grow">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} autoComplete="off" required />
        </label>
        <label className="field grow">
          <span>Password (8 characters or more)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <ProfileFields grow value={profile} onChange={setProfile} />
        <label className="check">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Admin
        </label>
        <button className="btn primary" disabled={busy}>Add user</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="muted" role="status">{notice}</p>}

      <ul className="rows">
        {users.map((u) => (
          <li key={u.id} className="row-card user-card">
            <div className="row-main">
              <span className="row-title">{u.username}</span>
              {u.isAdmin && <span className="badge">Admin</span>}
              {details(u) && <p className="muted small">{details(u)}</p>}
              <p className="muted small">{u.id === meId ? "This is you" : u.isAdmin ? "Can manage users" : "Editor"}</p>
            </div>
            {u.id === meId && <Link href="/account" className="btn small">Edit your details</Link>}
            {u.id !== meId && (
              <div className="row-actions">
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    run(`/api/users/${u.id}`, "PATCH", { isAdmin: !u.isAdmin }, `${u.username} is now ${u.isAdmin ? "an editor" : "an admin"}.`)
                  }
                >
                  {u.isAdmin ? "Make editor" : "Make admin"}
                </button>
                <button className="btn small" onClick={() => toggleEdit(u)}>Edit</button>
                <button className="btn small danger" disabled={busy} onClick={() => remove(u)}>Delete</button>
              </div>
            )}
            {editId === u.id && (
              <form className="inline-form row-form" onSubmit={(e) => saveEdit(e, u)}>
                <label className="field grow">
                  <span>Username</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={40}
                    autoComplete="off"
                    required
                    autoFocus
                  />
                </label>
                <label className="field grow">
                  <span>New password (blank to keep it)</span>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <ProfileFields grow value={editProfile} onChange={setEditProfile} />
                <button className="btn primary" disabled={busy}>Save</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
