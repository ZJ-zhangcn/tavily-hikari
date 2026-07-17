# Personal fork notes

## Image (GHCR, pull-only on VPS)

- Workflow: `.github/workflows/personal-image.yml`
- Image: `ghcr.io/zj-zhangcn/tavily-hikari:personal` (also `:<short-sha>`)
- VPS must only `docker compose pull && up -d` — never `build` on gateway-vps.

## Affinity product changes

- Balanced assignment: rank score subtracts load (`primary + 0.25*secondary`) * 10
- Schema: `forward_proxy_key_affinity.locked`
- Admin API:
  - `GET /api/settings/forward-proxy/key-affinity`
  - `PUT /api/settings/forward-proxy/key-affinity/:key_id` body `{ primaryProxyKey?, secondaryProxyKey?, locked? }`
  - `POST /api/settings/forward-proxy/key-affinity` body `{ onlyUnlocked?: true }` → rebalance
- Quota probe concurrency: validate batch uses `buffer_unordered(2)`
- Web: Forward Proxy page → Key ↔ Proxy affinity panel + Rebalance unlocked

## Deploy on gateway-vps

```bash
# in compose service image field:
# image: ghcr.io/zj-zhangcn/tavily-hikari:personal
docker compose pull tavily-hikari   # service name may differ
docker compose up -d tavily-hikari
```

After upgrade, call rebalance once (admin session / master key):

```bash
curl -X POST -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"onlyUnlocked":true}' \
  https://travily-pool.942645.xyz/api/settings/forward-proxy/key-affinity
```
