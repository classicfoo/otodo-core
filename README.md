# Otodo Core

Offline-first single-list todo app built with PHP 8 + SQLite and vanilla HTML/CSS/JS.

## Features
- Offline-first app shell cached via Service Worker.
- Local task mirror and outbox powered by IndexedDB.
- Optimistic UI for add/edit/toggle/delete.
- Syncs when back online with simple last-write-wins logic.

## Setup (Shared Hosting)
1. Upload all files to your hosting root.
2. Ensure the `/data` directory is writable by PHP.
3. Visit the site. The database and tables are created automatically.

## Local Development
```bash
php -S localhost:8000
```
Then open http://localhost:8000. The service worker requires a local HTTP origin (not `file://`).

## API
Single endpoint: `/api.php?action=...`
- `ping`
- `list`
- `upsert`
- `toggle`
- `delete`
- `sync_outbox`

All responses are JSON: `{ ok: true, data: ... }` or `{ ok: false, error: "...", code: "..." }`.

## Notes
- CSRF token is generated in session and sent via `X-CSRF-Token` header.
- SQLite database file lives in `/data/otodo.sqlite` and uses WAL mode.
