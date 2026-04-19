# web4browser Admin Deployment Bundle

## Included

- `website/`: admin dashboard pages, pricing admin page, shared admin theme, and site config helper
- `services/internal-api-server/`: deployable backend source for `/api` and `/api/admin/*`

## Deploy Suggestion

1. Upload `website/` to the web root for `web4browser.io`
2. Upload `services/internal-api-server/` to the application server
3. In `services/internal-api-server/`, create `.env` from `.env.example`
4. Install dependencies:

```bash
npm install
```

5. Start service:

```bash
pm2 start server.mjs --name web4browser-internal-api
```

6. Reverse proxy:

- Public site: `https://web4browser.io`
- API proxy: `https://web4browser.io/api` -> `http://127.0.0.1:3001/api`
- Protect `/admin*.html` and `/api/admin/*` with Basic Auth, Cloudflare Access, VPN, or IP allowlist

## Important

- Do not expose Electron local services `127.0.0.1:3210` or `127.0.0.1:18999` to the public internet
- Keep `services/internal-api-server/data/` writable if JSON storage is used
- Production should set `ALLOW_MOCK=0`
