# Deploying Cake Break on Dokploy

Production stack: **db** (Postgres) · **redis** · **backend** (Medusa v2) · **storefront** (Next.js).

- Storefront → `https://cakebreak.codeation.io`
- Backend + Admin → `https://cakebreak-backend.codeation.io` (admin at `/app`)

Uses `docker-compose.prod.yml` (no host ports — Dokploy's Traefik routes domains to containers).

---

## 1. Create the Compose app
- New project → **Compose**.
- Point it at this repo / branch, compose path: `my-franchise-platform/docker-compose.prod.yml`.

## 2. Set environment variables
Copy everything from **`.env.docker.example`** into Dokploy's **Environment** tab and replace every `CHANGE_ME`:
- `openssl rand -base64 32` for `JWT_SECRET` and `COOKIE_SECRET`.
- A strong `POSTGRES_PASSWORD`, mirrored inside `DATABASE_URL`.
- Leave `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_CHANGE_ME` for now (set in step 6).

> `NEXT_PUBLIC_*` are baked at **build time**. Changing them later requires a **rebuild**, not just a restart.

## 3. Add domains (Dokploy → service → Domains)
| Service | Domain | Container port | HTTPS |
|---|---|---|---|
| `backend` | `cakebreak-backend.codeation.io` | `9000` | on (Let's Encrypt) |
| `storefront` | `cakebreak.codeation.io` | `3000` | on (Let's Encrypt) |

Point both DNS records (A/AAAA or CNAME) at the Dokploy host first, so cert issuance succeeds.

## 4. First deploy
Deploy. Watch the **backend** logs — on a fresh DB it runs all migrations + the
`initial-data-seed` script (this is the SSL-sensitive step; `DATABASE_SSL=false`
is what keeps it from hanging). Wait for `Server is ready on port: 9000` and a
**healthy** status. The storefront starts only once the backend is healthy.

## 5. Create an admin user
Dokploy → backend service → **Terminal** (or `docker exec`):
```bash
npx medusa user -e you@codeation.io -p 'a-strong-password'
```
Log in at `https://cakebreak-backend.codeation.io/app`.

## 6. Wire the storefront's publishable key
1. Admin → **Settings → Publishable API Keys** → copy the key (`pk_...`).
   Make sure it's linked to a **Sales Channel** that has your products.
2. In Dokploy, set `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` to that value.
3. **Rebuild/redeploy the storefront** (build-time value).
4. Visit `https://cakebreak.codeation.io`.

## 7. (Optional) Seed franchise/catalogue data
Set `RUN_SEED=true` once and redeploy the backend, then set it back to `false`.
Or run manually: `npx medusa exec ./src/scripts/seed-franchise-data.ts`.

---

## Operational must-dos
- **Backups:** enable Dokploy's scheduled Postgres backups (the DB lives in the
  `postgres_data` volume — no backup = no recovery).
- **Single backend replica:** migrations run on container start, so do not scale
  the backend to >1 replica without moving migrations to a one-shot step.
- **Secrets:** never commit `.env.docker`; it's gitignored. Manage values in Dokploy.

## Troubleshooting
- **Storefront calls fail / CORS errors:** `STORE_CORS` must equal the storefront
  origin exactly (scheme + host, no trailing slash). `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
  must be the public backend URL and requires a storefront rebuild to change.
- **Admin login won't stick (cookie dropped):** Medusa is behind Traefik (TLS
  terminated at the proxy). If sessions don't persist, confirm requests reach the
  backend as HTTPS (`X-Forwarded-Proto: https`) — Dokploy/Traefik sets this by
  default. Both admin URL and `ADMIN_CORS` must be the same `https://` backend host.
- **Backend stuck "unhealthy":** check logs for `does not support SSL` (set
  `DATABASE_SSL=false`) or a DB auth mismatch between `DATABASE_URL` and `POSTGRES_*`.
- **Build slow/times out:** the backend's `.medusa/server` install pulls ~1100
  packages (~3 min). Ensure the Dokploy build host has adequate CPU/RAM/timeout.
