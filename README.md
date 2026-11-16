# SamuelJohnIbro-Portfolio

**Personal Software Engineering Portfolio & Edge CMS Platform — Samuel Silachomka John-Ibro (chomkaTECH™)**

`SamuelJohnIbro-Portfolio` is a full-stack personal engineering portfolio and edge-hosted content management platform built with React, Vite, Cloudflare Workers, and Cloudflare D1. It showcases software engineering projects, technical skills, cloud computing training, credentials, and creative work while providing a built-in, security-hardened Admin Studio for managing live content and media without redeploying source code.

Live site: [https://sji.sjip.workers.dev/](https://sji.sjip.workers.dev/)

## Overview

The application serves two surfaces from a single Cloudflare Worker deployment:

1. **Public Portfolio (`/`)** — A responsive, dark-themed showcase featuring an interactive orbital spacetime canvas, typewriter hero section, live-first project masonry grid with expandable live site previews, technical skills, an interactive cloud training media carousel, credentials, creative extras, and contact links.
2. **Portfolio Studio (`/admin` or custom `ADMIN_PATH`)** — A lazy-loaded, non-indexed administrative studio backed by Cloudflare D1 for editing every section, managing uploaded media assets, exporting/importing JSON backups, and publishing live updates immediately.

When the D1 API is unreachable (such as standalone `vite` preview without a Worker backend), the frontend gracefully falls back to the bundled baseline dataset in `src/data/defaultPortfolio.js`.

## Key capabilities

### Public portfolio experience

- **Interactive orbital background** — Responsive, frame-rate-independent HTML5 Canvas animation (`SpaceBackground`) rendering an orbital eclipse horizon, 3D Keplerian satellite trajectories, ambient drifting star-motes, and a spacetime geodesic mesh, paired with a pure-CSS orbital fallback so ambient motion works across viewports, browser privacy protections, and system animation settings.
- **Dynamic hero & SEO synchronization** — Intersection-driven typewriter headline with accent highlighting (`resolveHeadlineParts`) and dynamic document title/meta description updates.
- **Smart projects masonry grid** — Projects sorted automatically (`LIVE` first, then newest to oldest within each status) into a balanced shortest-column masonry layout (`ProjectsGrid`) with inline interactive site previews and an accessible fullscreen modal (`ProjectPreview`).
- **Training media carousel** — Mixed-media showcase (`TrainingCarousel`) supporting images, auto-timed short video clips, and embedded YouTube/Vimeo presentations, alongside structured training role/focus notes.
- **Full section suite** — Dedicated sections for About (`01`), Projects (`02`), Technical Toolkit (`03`), Cloud Computing Training (`04`), Education & Credentials (`05`), Creative Extras (`06`), and Contact (`07`).

### Portfolio Studio (`/admin` CMS)

- **11-tab management workspace** — Overview, Hero & Brand, About, Projects, Skills, Training, Credentials, Extras, Contact, Cloudflare D1 Media Vault, and Security.
- **Live publishing & cross-tab sync** — Persists normalized portfolio JSON to Cloudflare D1 (`portfolio_state`) and broadcasts live updates across open browser tabs via `BroadcastChannel`.
- **Backup & recovery** — Export full JSON snapshots, import backups into draft state, discard unsaved edits, or reset live state back to the baseline portfolio configuration.
- **Offline hash generator** — Client-side WebCrypto tool (`passwordCrypto.js`) to generate salted `PBKDF2-SHA256` secrets without sending plaintext passwords over the network.

### Edge Media Vault

- **Chunked D1 uploads** — Browser-side chunked uploader (`mediaUpload.js`) splits images (`PNG`, `JPEG`, `WebP`, `GIF`, `AVIF`, `SVG`), videos (`MP4`, `WebM`, `QuickTime`), and `PDF` documents (up to 25 MB per file) into 256 KB blobs stored in D1 (`media_files` and `media_chunks`).
- **HTTP range & cache streaming** — `/media/:id/:filename` supports `HEAD`, `ETag` (`304 Not Modified`), immutable cache headers, and `Range` (`206 Partial Content`) byte-range streaming for smooth video scrubbing.

## Architecture

```text
                      Browser Client (React 19 + Vite)
                                     |
         +---------------------------+---------------------------+
         |                                                       |
   Public Portfolio                                  Lazy-Loaded Admin Studio
   PortfolioPage.jsx                                  AdminApp.jsx (/admin)
         |                                                       |
         +---------------------------+---------------------------+
                                     |
                      Cloudflare Worker (worker/index.js)
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
   Static Assets                 REST API                 Media Streaming
   (ASSETS / dist)               (/api/*)                (/media/:id/:name)
                                     |
                      Cloudflare D1 (sji-portfolio-db)
       portfolio_state | media_files | media_chunks | internal_config | login_attempts
```

### D1 database tables

Tables are initialized automatically on first database access by `ensureDatabaseReady` in `worker/index.js`:

| Table | Purpose |
|---|---|
| `portfolio_state` | Stores the active published portfolio JSON (`id = 1`) and `updated_at` timestamp |
| `media_files` | Tracks uploaded asset metadata, MIME type, byte size, chunk count, and status |
| `media_chunks` | Stores 256 KB binary `BLOB` chunks keyed by `(media_id, chunk_index)` |
| `internal_config` | Persists auto-generated `session_secret` fallback when `SESSION_SECRET` env var is unset |
| `login_attempts` | Tracks hashed IP login failures and lockout timestamps for brute-force protection |

## Project structure

```text
SamuelJohnIbro-Portfolio/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── eslint.config.js
├── wrangler.jsonc
├── public/
│   ├── assets/                        # Static images, logos, and training media
│   ├── robots.txt                     # Disallows /api/ and /admin indexing
│   ├── site.webmanifest
│   └── ...                            # Favicons and app icons
├── scripts/
│   └── set-admin-password.mjs         # CLI helper for PBKDF2-SHA256 hashes & secrets
├── src/
│   ├── App.jsx                        # Route resolver between public view and Admin Studio
│   ├── App.css
│   ├── index.css
│   ├── main.jsx
│   ├── admin/
│   │   ├── AdminApp.jsx               # 11-tab CMS dashboard and auth shell
│   │   ├── MediaField.jsx             # Reusable asset uploader & library picker
│   │   ├── admin.css
│   │   ├── mediaUpload.js             # 256 KB chunked upload client
│   │   └── passwordCrypto.js          # Browser WebCrypto PBKDF2-SHA256 hash generator
│   ├── components/
│   │   ├── PortfolioPage.jsx          # Main portfolio sections and layout
│   │   ├── ProjectPreview.jsx         # Live iframe preview card & fullscreen modal
│   │   ├── ProjectsGrid.jsx           # Balanced shortest-column masonry layout
│   │   ├── SpaceBackground.jsx        # Orbital eclipse & spacetime canvas animation
│   │   └── TrainingCarousel.jsx       # Auto-advancing image/video/embed carousel
│   └── data/
│       └── defaultPortfolio.js        # Baseline content, normalization & sorting helpers
├── worker/
│   └── index.js                       # Cloudflare Worker API, D1 persistence, auth & media
└── README.md
```

## API overview

| Access | Method & Endpoint | Description |
|---|---|---|
| Public | `GET /api/health` | Returns Worker, D1 binding, and auth configuration status |
| Public | `GET /api/portal-check?path=...` | Checks whether a route matches `ADMIN_PATH` (default `/admin`) |
| Public | `GET /api/portfolio` | Fetches normalized portfolio content from D1 (or bundled fallback) |
| Public | `GET\|HEAD /media/:id/:filename` | Streams ready media files from D1 chunks with `ETag` and `Range` support |
| Auth | `GET /api/admin/session` | Reports authentication state, secret setup status, and media usage stats |
| Auth | `POST /api/admin/login` | Verifies password against `ADMIN_PASSWORD_HASH` and issues signed cookie |
| Auth | `POST /api/admin/logout` | Clears the admin session cookie |
| Admin | `GET\|PUT /api/admin/portfolio` | Reads or validates, normalizes, and publishes portfolio JSON to D1 |
| Admin | `POST /api/admin/portfolio/reset` | Resets D1 `portfolio_state` back to `DEFAULT_PORTFOLIO` |
| Admin | `GET /api/admin/media` | Lists ready files in the D1 Media Vault |
| Admin | `POST /api/admin/media/init` | Validates MIME type/size (≤ 25 MB) and creates a pending upload session |
| Admin | `PUT /api/admin/media/:id/chunk/:index` | Stores a 256 KB binary chunk in `media_chunks` |
| Admin | `POST /api/admin/media/:id/complete` | Verifies all chunks exist and marks the file `ready` |
| Admin | `DELETE /api/admin/media/:id` | Permanently deletes a file and its chunks from D1 |

## Run locally

### Prerequisites

- **Node.js** (v18+ recommended) and **npm**
- **Wrangler CLI** (included in devDependencies) for local Cloudflare Worker + D1 simulation

### 1. Install dependencies

```bash
npm install
```

### 2. Configure local admin secrets (for full Worker + CMS testing)

Generate `.dev.vars` (gitignored) with a salted `ADMIN_PASSWORD_HASH` and random `SESSION_SECRET`:

```bash
npm run admin:dev-secret
```

### 3. Start local development

Run the full production-like local stack (Vite build + Cloudflare Worker + local D1):

```bash
npm run dev:worker
```

Or run the Vite dev server alone (proxies `/api` and `/media` to `http://127.0.0.1:8787`):

```bash
npm run dev
```

### 4. Lint and build

```bash
npm run lint
npm run build
```

## Deployment & configuration

Production builds are configured in `wrangler.jsonc` for Worker `sji` with Cloudflare D1 database `sji-portfolio-db` (`DB` binding).

1. **Set the admin password secret** on Cloudflare Workers:

   ```bash
   npm run admin:password
   ```

   Or generate a hash locally with `npm run admin:hash` and save it as an encrypted Worker secret named `ADMIN_PASSWORD_HASH` in the Cloudflare Dashboard.

2. **Optional environment secrets/variables**:
   - `SESSION_SECRET` — Dedicated HMAC signing key (at least 16 characters); if omitted, the Worker auto-generates and stores one in `internal_config`.
   - `ADMIN_PATH` — Custom hidden admin path (e.g. `/custom-studio-route`) to replace the default `/admin` route.

3. **Deploy to Cloudflare Workers**:

   ```bash
   npm run deploy
   ```

## Security architecture

- **Zero plaintext credential storage** — Admin passwords are verified via salted `PBKDF2-SHA256` (100,000 iterations) stored exclusively in Cloudflare Worker Secrets (`ADMIN_PASSWORD_HASH`), never in Git, client bundles, or D1.
- **Hardened session cookies** — Sessions use `HMAC-SHA256` signed tokens stored in `HttpOnly; SameSite=Strict` cookies (`Secure` over HTTPS) with a 12-hour TTL and a password-hash fingerprint (`ph`) so rotating `ADMIN_PASSWORD_HASH` immediately invalidates active sessions.
- **Brute-force rate limiting** — Failed login attempts are tracked by salted IP hash in D1 (`login_attempts`); 5 failures within 15 minutes trigger a 15-minute lockout (`429 Too Many Requests` with `Retry-After`).
- **Origin & payload safeguards** — Mutating auth/admin endpoints enforce same-origin `Origin`/`Referer` checks, portfolio payloads are capped at 512 KB and validated against unsafe URL protocols (`isSafeMediaOrLinkUrl`), and uploaded SVGs are served with `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`.
- **Search-engine exclusion** — `public/robots.txt` disallows `/api/` and `/admin`, API responses include `X-Robots-Tag: noindex, nofollow`, and `AdminApp` sets `noindex, nofollow, noarchive` metadata while active.

## Note on repository secrets

Do not commit `.dev.vars`, Wrangler authentication state (`.wrangler/`), plaintext admin passwords, `ADMIN_PASSWORD_HASH` values, or `SESSION_SECRET` tokens to this repository.
