# 老驴 Internal API Server

Minimal Node 20 service for:

- `GET /api/health`
- `GET /api/plans`
- `GET /api/entitlement/current`
- `GET /api/orders`
- `POST /api/checkout/create`
- `POST /api/device/activate`
- `GET /api/device/list`
- `POST /api/auth/google/exchange`
- `POST /api/auth/logout`
- `GET /api/account/me`
- `GET /api/billing/plans`
- `GET /api/billing/subscription`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `GET /api/admin/overview`
- `GET /api/admin/orders`
- `GET /api/admin/subscriptions`
- `GET /api/admin/devices`
- `GET /api/admin/audit`
- `GET /api/admin/users`
- `GET /api/admin/users/detail`
- `POST /api/admin/users/adjust-points`
- `POST /api/admin/users/update-status`
- `POST /api/admin/users/model-route`
- `GET /api/admin/model-routing`
- `POST /api/admin/model-routing/routes/save`
- `POST /api/admin/model-routing/memberships/save`
- `GET /api/admin/usage`
- `GET /api/admin/ledger`
- `GET /api/admin/reports`
- `GET /api/chat/sessions`
- `GET /api/chat/history`
- `POST /api/chat/send`
- `POST /api/chat/sessions/delete`

Notes:

- When `GOOGLE_CLIENT_ID` / `GOOGLE_REDIRECT_URI` are missing, the server runs in mock mode.
- No extra npm dependencies are required.
- Recommended deployment: `pm2 start server.mjs --name laolv-internal-api`
- New users receive a trial wallet automatically after Google sign-in.
- Commercial plan discovery now lives under `/api/plans`, while subscription rights for the desktop client are exposed through `/api/entitlement/current`.
- Device activations are persisted as JSON when PostgreSQL is not configured, so entitlement development can run locally without extra infrastructure.
- Local model/provider management is disabled at the product layer; access is granted through trial or purchased credits only.
- When `MINIMAX_API_KEY` is present, chat requests are proxied to your server-side MiniMax model; otherwise the chat endpoint returns a deterministic mock reply for UI testing.
- Usage events and wallet ledger entries are persisted as JSON files so the admin page can display token usage, estimated cost, and points movements.
- Recommended production setup is to expose admin traffic behind `https://console.web4browser.io` and public API traffic behind `https://api.web4browser.io/api`.

Recommended environment variables:

```bash
PORT=3001
DATABASE_URL=postgresql://laolv:change-me@127.0.0.1:5432/laolv_admin
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:36619/auth/google/callback
PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api
ADMIN_ALLOWED_HOSTS=console.web4browser.io,127.0.0.1,localhost
ALLOW_MOCK=1
DEFAULT_TRIAL_POINTS=600
DEFAULT_TRIAL_DAYS=3
LOW_BALANCE_THRESHOLD=200
USERS_DB_PATH=/var/www/part2/laolv-internal-api/data/users.json
CHATS_DB_PATH=/var/www/part2/laolv-internal-api/data/chats.json
SESSIONS_DB_PATH=/var/www/part2/laolv-internal-api/data/sessions.json
USAGE_DB_PATH=/var/www/part2/laolv-internal-api/data/usage-events.json
LEDGER_DB_PATH=/var/www/part2/laolv-internal-api/data/wallet-ledger.json
ORDERS_DB_PATH=/var/www/part2/laolv-internal-api/data/orders.json
DEVICES_DB_PATH=/var/www/part2/laolv-internal-api/data/devices.json
ADMIN_AUDIT_LOG_DB_PATH=/var/www/part2/laolv-internal-api/data/admin-audit-logs.json
CHAT_COST_PER_MESSAGE=20
INPUT_COST_PER_1K_TOKENS=0
OUTPUT_COST_PER_1K_TOKENS=0
TOKENS_PER_POINT=120
ADMIN_PAGE_SIZE=50
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
LAOLV_UPSTREAM_MODEL=MiniMax-M2.7
LAOLV_MODEL_DISPLAY_NAME=老驴 AI
```

Admin preview page:

- Website: `https://console.web4browser.io/admin.html`
- API base: `https://api.web4browser.io/api`
- Additional pages:
  - `https://console.web4browser.io/admin-users.html`
  - `https://console.web4browser.io/admin-ledger.html`
  - `https://console.web4browser.io/admin-usage.html`
  - `https://console.web4browser.io/admin-reports.html`
