# Console/API Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split production deployment into `console.web4browser.io` for admin access and `api.web4browser.io` for external APIs, while hardening `/admin*.html` and `/api/admin/*` with proxy-level and app-level protection.

**Architecture:** Keep one Node API service, but decouple public relay URLs from admin frontend URLs. Enforce admin API host allowlists in `internal-api-server` as defense-in-depth, and provide host-level Nginx configs so `console` gets Basic Auth plus admin login while `api` blocks admin routes entirely.

**Tech Stack:** Node.js, static admin website, Nginx, Docker Compose, Node test runner

---

### Task 1: Map runtime configuration

**Files:**
- Modify: `services/internal-api-server/server.mjs`
- Modify: `services/internal-api-server/.env.example`
- Modify: `services/internal-api-server/.env.docker`

- [ ] Add env-driven config for `PUBLIC_RELAY_BASE_URL` and `ADMIN_ALLOWED_HOSTS`
- [ ] Keep existing local defaults working when these env vars are absent
- [ ] Make note of which responses expose relay URLs and must use the new config

### Task 2: Add regression tests first

**Files:**
- Modify: `services/internal-api-server/admin-auth.test.mjs`

- [ ] Write a failing test that restricts `/api/admin/*` and `/api/` to `console.web4browser.io`
- [ ] Verify the test fails against the current implementation
- [ ] Extend assertions so `api.web4browser.io` returns a non-admin-facing response

### Task 3: Implement admin host hardening

**Files:**
- Modify: `services/internal-api-server/server.mjs`

- [ ] Add a helper to validate admin request hosts against `ADMIN_ALLOWED_HOSTS`
- [ ] Apply it to `/api/` and `/api/admin/*`
- [ ] Return a low-information response when the host is not allowed
- [ ] Re-run the admin auth test and confirm it passes

### Task 4: Decouple public relay URLs from admin origin

**Files:**
- Modify: `services/internal-api-server/server.mjs`
- Modify: `services/internal-api-server/database.mjs`
- Modify: `website/admin.js`

- [ ] Replace hard-coded `https://web4browser.io/api` relay URLs with `PUBLIC_RELAY_BASE_URL`
- [ ] Include relay URL data in the admin overview payload so dashboard UI does not derive it from `location.origin`
- [ ] Update dashboard rendering to use server-provided relay URLs
- [ ] Verify existing admin detail views still show the correct endpoint values

### Task 5: Add production reverse-proxy samples

**Files:**
- Create: `deploy/nginx/console.web4browser.io.conf`
- Create: `deploy/nginx/api.web4browser.io.conf`

- [ ] Add a `console` host config with Basic Auth and explicit allow/block rules for admin paths
- [ ] Add an `api` host config that exposes public APIs and blocks admin paths
- [ ] Keep proxy headers compatible with the Node app’s session and host checks

### Task 6: Update deployment docs

**Files:**
- Modify: `README.md`

- [ ] Document the new `console` / `api` split
- [ ] Explain which project files and env vars must be changed in production
- [ ] Add Basic Auth setup steps for the `console` host
- [ ] Add verification commands for blocked admin exposure on `api`

### Task 7: Verify the full change set

**Files:**
- Test: `services/internal-api-server/admin-auth.test.mjs`
- Test: `services/internal-api-server/auth-password-flow.test.mjs`
- Test: `website/admin-auth-visibility.test.mjs`

- [ ] Run the targeted Node tests
- [ ] Run syntax checks for edited JS files
- [ ] Review the new Nginx configs and README for consistency with the implemented env vars
