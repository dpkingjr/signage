# Signage

A small Next.js (App Router) app for running a digital sign from a web browser.
Upload images, group them into playlists, set how long each image stays on screen,
then point any browser at the player address.

- **Database:** SQLite via `better-sqlite3` (file at `data/signage.db`)
- **Images:** stored on disk in `data/uploads/`
- **Auth:** username + password, server-side sessions (httpOnly cookie)

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

For production:

```bash
npm run build
npm start
```

On first visit you'll be asked to create the admin account (only possible while no account exists).

## Addresses

| Path | Access | Purpose |
| --- | --- | --- |
| `/login` | public | Sign in / first-run setup |
| `/library`, `/playlists`, `/playlists/:id` | sign-in required | Manage images and playlists |
| `/account` | sign-in required | Change your own password |
| `/users` | admins only | Add and remove users, set roles, reset passwords |
| `/player` | **public** | Plays the default playlist |
| `/player/:slug` | **public** | Plays a specific playlist |
| `/api/player`, `/media/*` | **public** | Data and images the player needs |

Everything else, including all other API routes, requires a signed-in session.

## Users

There are two roles. **Editors** can manage images and create or edit playlists. **Admins** can also delete playlists and manage users.

- The first account is an admin. Accounts created before roles existed become admins when the app is upgraded.
- Each user has a first name, last name and email address. All three are optional, and the email isn't used for signing in.
- Anyone can change their own details on their account page. Admins can change anyone else's from the Users page, along with their username and password.
- Anyone can change their own password: select your username at the top of the page to open your account.
- Admins can't delete themselves or remove their own admin role, so there is always at least one admin.
- An admin changing a password signs that user out everywhere. Changing your own signs out your other devices.

## Folders

The library can sort images into folders, one level deep. They're for keeping images organized and don't affect playlists or the player.

- Images uploaded while a folder is open go into that folder.
- An image lives in one folder at most. Tick images in the library to move them.
- Deleting a folder keeps its images; they move out to "No folder".

## Player behavior

- Mobile-first, full-screen black page; images crossfade.
- Each playlist has a default time per image. Any image in a playlist can override it with its own time (1–3600 s); images left blank follow the default, including when the default changes later.
- "Show whole image" letterboxes; "Fill the screen" crops to cover.
- Tap the screen to toggle full screen. The screen is kept awake where the browser supports it.
- The player re-checks for changes every 30 seconds and keeps playing if the network drops.

## Show dates

Every entry (image or video) can have an optional **Show from** and **Show until** date. Both are inclusive and either can be left blank; an entry with neither is always shown. **Clear dates** removes both at once. The player compares them with the date on the screen's own device, so a sign shows an entry from the first minute of its start date through the end of its end date. Entries outside their dates are skipped, and if none remain the player says nothing is scheduled.

## Video entries

- The video's server must allow it to be played from other sites, and it must be a direct file link, not a YouTube or Vimeo page.
- If this app is served over HTTPS, the video address must also be HTTPS, or browsers will block it.

## Configuration

Copy `.env.example` to `.env` if you need to change anything.

- `DATA_DIR` – where the database and uploads live.
- `COOKIE_SECURE=true` – set this when serving over HTTPS.

## Notes

- Images are served as uploaded (no resizing). Resize very large photos before uploading for smoother playback on small devices.
- Sign-in attempts are rate limited per IP (in memory, resets on restart). Behind a reverse proxy, make sure it sets `X-Forwarded-For`.
- Back up the whole `data/` folder to back up the sign.
