# FilterTrack V1 — Backend (API + SQLite)

FilterTrack V1 is **software-only** (no sensor). It stores filters and their history in **SQLite** and exposes a REST API for your dashboard.

## Quick start

1) Install dependencies

```bash
npm install
```

2) Create an `.env` file (copy from `.env.example`)

```bash
cp .env.example .env
```

3) Run the server

```bash
node index.js
```

4) Test

Open:

* `GET http://localhost:3000/health`
* `GET http://localhost:3000/filters`

## API summary

* `POST /filters` — create a filter
* `GET /filters` — list filters (query: `area`, `status`, `state`, `q`)
* `GET /filters/:filter_id` — get one
* `PUT /filters/:filter_id` — edit
* `PATCH /filters/:filter_id/archive` — archive
* `POST /filters/:filter_id/replace` — replace (archive old + create new)
* `GET /filters/:filter_id/events` — history

### Backward-compatible aliases
* `POST /filtros` → `POST /filters` (maps legacy fields)
* `GET /filtros` → `GET /filters`

## Notes

* Do **not** commit secrets (credentials, private keys) to git.
* Google Sheets is optional and disabled by default.
