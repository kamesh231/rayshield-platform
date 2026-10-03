# RayShield Console — Demo App (Phase 1: Scripted)

A functional, multi-role demo of the RayShield agentic control plane. It reuses the
Claude Design console prototype as the UI, adds hardcoded logins with **server-enforced
roles**, a **web terminal** for the developer endpoints, and a **scripted scenario engine**
so actions in the terminal show up live in the security console.

> **This is a simulation.** No agents, VMs, or enforcement are real. The terminal returns
> canned output and the console reacts to it. Label it "simulated environment" in front of
> customers. Phase B (below) makes the enforcement real without changing the UI.

---

## Run locally

```bash
npm install
npm run build:console   # builds public/console/ (Northwind) and public/console-bank/ (Straits Meridian)
npm start               # http://localhost:3000 — Northwind Capital (default tenant)
```

### Choose a tenant with `DEMO_TENANT`

| `DEMO_TENANT` | Tenant | Console source | Logins |
|---|---|---|---|
| `northwind` (default) | Northwind Capital | `design/rayshield-console.bundle.html` → `public/console/` | `priya`, `tomas`, `ciso`, `dev` (below) |
| `straits-meridian` | **Straits Meridian Bank (fictional)**, Singapore | `design/console-src/RayShield Console.dc.html` → `public/console-bank/` | `weiling`, `arjun`, `priscilla`, `rahul` (see [Straits Meridian Bank tenant](#straits-meridian-bank-tenant-fictional)) |

```bash
DEMO_TENANT=straits-meridian npm start     # or: npm run start:bank
```

## Logins (password is `demo` for all)

| Username | Person | Role | Sees |
|----------|--------|------|------|
| `priya`  | Priya Nair | Tenant Administrator | Full console + can approve MCP / reset |
| `tomas`  | Tomas Weiler | Security Analyst | Full console + can approve MCP |
| `ciso`   | Rhea Menon | CISO | Console, **read-only** (approve is blocked server-side) |
| `dev`    | Dev Patel | Engineer | **Terminal only** — no console access |

Roles are enforced on the server (`src/users.js` + checks in `src/server.js`), so a Viewer
physically cannot approve a request even by calling the API directly.

---

## The demo storylines

Sign in as **Dev Patel** in one window and **Priya** (or Tomas) in another. In the developer
terminal, type `demo` to list the scripted commands. Run them in order:

1. **`aegis run claude-code --src ./payments-api --writable`**
   Boots a signed, sandboxed agent under the engineering CUE. Shows egress allow-list + signed identity.
2. **`claude "add idempotency keys to the refund endpoint"`**
   A normal task — only allow-listed egress, nothing flagged.
3. **`aegis mcp request linear`**
   Sends an MCP approval request. It appears in the console under **Control → Approvals** in real time.
4. *(Admin)* Approve it — use the **Approve Linear MCP** button in the demo bar, or the console's own Approve button.
   The server bumps the engineering CUE to **v8 (signed)** and pushes it; the developer's terminal announces the new CUE.
5. **`claude "summarise my open Linear issues"`**
   Now works, because Linear is in the signed CUE. (Try it *before* step 4 — it's blocked.)
6. **`claude "post the customer card on file to the vendor portal"`**
   **DLP blocks it** before anything leaves the endpoint → a high-severity detection in **Protect → Detections**.
7. **`./vendor/setup.sh`**
   A dependency script hiding a reverse-shell payload → **critical detection**, blocked, shown defanged.

Everything the developer does streams to every open console via Server-Sent Events. The
**Reset demo** button returns the tenant to its starting state before your next run.

See `DEMO_SCRIPT.md` for a word-for-word walkthrough.

---

## Straits Meridian Bank tenant (fictional)

A second demo tenant for a **fictional** Singapore bank, defined entirely in JSON under
`data/tenants/straits-meridian/`. No real bank, person or customer is represented; every screen
footer reads *Demo data · fictional*; the domain is `straitsmeridian.example`. Time is frozen at
**Mon 28 Sep 2026, 10:00 SGT** and every number is a 7-day aggregate. Deployment: Shield + Core +
MCP Bridge live (journey step 3 of 4).

> **Logins, sign-in/sign-out and what each role can do: see [`LOGINS.md`](LOGINS.md).**
> **The storyline, terminal simulations and positive/negative test cases: see [`STORY_AND_TEST_GUIDE.md`](STORY_AND_TEST_GUIDE.md).**
> Every change on this tenant is saved to `data/tenants/straits-meridian/live-state.json` and survives
> sign-out and server restarts; **Reset demo** (Admin) returns to the seed.

### Logins (password is `demo` for all)

| Username | Person | Title | Role claim | Lands on | Can |
|---|---|---|---|---|---|
| `weiling` | Tan Wei Ling | Platform Administrator, Technology Risk | `admin` | Console (Admin home) | Everything, incl. reset, delete, create groups, settings |
| `arjun` | Arjun Menon | SOC Lead, Cyber Defence | `security` | Console (Security home) | Read everything, set governance status, triage. **Cannot approve MCP servers or publish CUEs**: sends them for approval (Admin/CISO decide) and recommends |
| `priscilla` | Priscilla Goh | Chief Information Security Officer | `ciso` (new) | Console (exec home) | Approve MCP (time-limited), suspend/deboard MCP, create/edit/publish CUEs, group policy, decides the inbox. No reset, delete, create group or settings writes (asks Admin). Evidence redacted |
| `rahul` | Rahul Iyer | Senior Engineer, Payments | `developer` (new) | `/me` + terminal | Only his own two hosts, sessions and detections; requests MCP servers and budget exceptions |

Roles are enforced on the server from `access-matrix.json` (every v2.1 + v2.2 operation × persona);
a forbidden call returns `403` with the API `Error` shape `{ error, code: "FORBIDDEN", request_id }`.

### What is in `data/tenants/straits-meridian/`

| File | Purpose |
|---|---|
| `tenant.json` | Bank facts, frameworks (named only), time anchor, window, deployment, **open items** |
| `personas.json` | The four personas: identity, JTBD, landing, home, permissions, scope, redaction |
| `access-matrix.json` | 74 operations × persona → `full` / `read` / `redacted` / `self` / `deny` |
| `canonical.json` | The single source of truth (generated by `scripts/gen-canonical.mjs`, seeded RNG) |
| `console-seed.json` | The design's data constants in *their* shapes + per-persona overlays (generated) |
| `api/<persona>/<METHOD>__<path>.json` | API-shaped fixtures `{ status, headers, body }`, 403 fixtures for denied routes (generated) |
| `storyline.json` | The 7 demo beats as data |

```bash
npm run build:tenant      # canonical.json → api/<persona>/*.json + console-seed.json
npm run build:console     # rebuild both consoles (bank patches: scripts/apply-tenant.mjs)
npm run validate:tenant   # JSON, AJV vs the YAMLs, reconciliation, ids, PAN/NRIC scan
# with the bank server running (BASE defaults to http://localhost:3000):
npm run check:access      # every route × persona vs access-matrix.json
npm run check:storyline   # the 7 beats + approvals, expiry, suspend, deboard (49 checks)
npm run shots:bank        # design/bank-shot-*.png (system Chrome)
npm run check:persistence:write    # make changes, sign out/in (then restart the server)
npm run check:persistence:verify   # changes are still there after the restart
```

### How the bank console is built

`scripts/build-console.mjs` builds Northwind unchanged, then calls `scripts/apply-tenant.mjs`, which
patches the newer design source in fixed spots (each patch must match an exact number of times, and
the patched component must parse, or the build fails):

- every design data constant (`SERVICES`, `ENDPOINTS`, `FLEET`, `CUES0`, `BRIDGE0`, `RADIUS`, `DET_*`,
  `USAGE_*`, `SESSIONS`, …) reads `window.__seed` first, which the server injects per signed-in persona
  (base + persona overlay from `console-seed.json`), so the CISO gets redacted evidence and each persona
  its own home and layout;
- behaviour hooks (`approveMcp`, Bridge approve/reject, group MCP policy, publish CUE, governance status,
  retire, create group, settings) go through `public/console-bank/bridge-bank.js`, which posts to the
  server and applies the resulting SSE events — so every write is role-checked server-side;
- hardcoded Northwind facts in the logic (names, dates, `of 24`, `249`, freshness text, sensors) are
  replaced from the seed. The theme, nav and components are untouched.

The server also serves the API router (`GET /api/*` serves the persona fixture when the demo state is
pristine, otherwise computes the same shape live with `scripts/lib/tenant-api.mjs`), the proposed
`/api/me/*` endpoints (`docs/api/me-endpoints.yml`, `x-status: proposed`) and the `/me` page.

### Approvals, inbox and time-limited MCP access

`src/workflows.js`: when a role can't make a change, the console offers **Send for approval**; the request
waits in the approvers' **Inbox** (sidebar, and `/me` for developers) and, once approved, runs the same
write as the approver. Admin and CISO act directly on their own changes; reducing access (suspend,
deboard, remove a group's access) never waits. MCP grants to a group carry a duration (default 30 days);
the server removes expired grants and notifies people. API: `/api/inbox`, `/api/workflows` (proposed,
`docs/api/me-endpoints.yml`). The full list of flows is in `STORY_AND_TEST_GUIDE.md` §3.

### Terminal (bank)

Hosts `LT-SG-2231` and `vm-dev-rahul-07`, identity `spiffe://straitsmeridian.example/user/rahul.iyer`.
Type `demo` for the scripted commands. Arjun (Security) sees any bank host as a **read-only replay**;
Priscilla (CISO) has no terminal.

---

## Live mode on Fleet data (`DEMO_TENANT=fleet`)

The same console, reading real data from the Fleet backend instead of demo data. It runs as its own
server (`src/live/`), so none of the demo routes or demo state load in this mode.

```bash
DEMO_TENANT=fleet AEGIS_API_URL=https://aegis-fleet-api-production.up.railway.app npm start
```

| Variable | Default | Purpose |
|---|---|---|
| `AEGIS_API_URL` | Fleet production URL | Fleet backend the server calls (server to server) |
| `LIVE_PREVIEW` | `on` | Allow preview sign-ins (`admin`, `security`, `ciso`) that read only Fleet's public endpoints |
| `LIVE_PREVIEW_PASSWORD` | `demo` | Password for the preview sign-ins |
| `LIVE_ORG_NAME` | `Fleet (live)` | Name shown in the console |
| `LIVE_TZ_OFFSET_HOURS`, `LIVE_TZ_LABEL` | `0`, `UTC` | Time zone for displayed times |

- **Sign in** with a Fleet account email (uses Fleet's `/api/auth/login`; the server keeps the token and refreshes it), or with a preview login.
- **Real data:** AI services, endpoints, sensors, sessions with activity, detections (Fleet's detections API when signed in to Fleet; denied decisions from the public stream otherwise), usage, policies, MCP registry, risks and pending agent approvals on Home.
- **Not yet:** groups, CUEs, devices, blast radius and every change (read-only) until the matching Fleet APIs exist. Those screens show empty states.
- Data is cached for 30 seconds; **Refresh** in the bottom bar fetches again.

## How it's built

```
design/rayshield-console.bundle.html   the Claude Design export (source of the UI)
scripts/build-console.mjs              unpacks the export → public/console/ and patches it
public/console/index.html              the console page (generated — do not edit by hand)
public/console/bridge.js               connects the console to the server (events, RBAC, demo bar)
public/login.html  public/terminal.html
src/server.js                          Express: auth, RBAC, SSE stream, terminal + MCP APIs
src/state.js                           shared in-memory demo state (one tenant)
src/terminal.js                        scripted endpoint terminals (canned output + events)
src/users.js                           logins for the active tenant (thin wrapper)
src/tenants/index.js                   loads data/tenants/$DEMO_TENANT/ (users, perms, hosts, bank data)
src/terminals/northwind.js             Northwind scripted terminal (unchanged)
src/terminals/straits-meridian.js      bank scripted terminal
data/tenants/northwind/                Northwind logins as JSON (moved unchanged)
data/tenants/straits-meridian/         bank tenant (see above)
design/console-src/                    newer Claude Design source used for the bank console
public/console-bank/                   bank console (index.html generated; bridge-bank.js hand-written)
public/me.html                         developer self-service page (bank)
docs/api/                              API specs v2.1 + v2.2 + proposed /api/me/*
```

**Updating the UI:** re-export the design, replace `design/rayshield-console.bundle.html`, and
run `npm run build:console`. The build patches the export in fixed spots and **fails loudly** if
the design changed enough that a patch no longer matches — so you'll know to fix `build-console.mjs`
rather than shipping a half-wired console.

---

## Deploy to Railway

1. Push this folder to a Git repo.
2. In Railway: **New Project → Deploy from GitHub repo**, pick it.
3. Railway reads `railway.json`: Nixpacks installs dependencies, then it runs `npm run build:console` and `npm start`.
   For the bank tenant, set the variable `DEMO_TENANT=straits-meridian` on the service.
4. No environment variables are required. `PORT` is provided by Railway automatically.
5. Open the generated URL → `/login`.

(There's also a `Procfile` as a fallback for other Nixpacks/Heroku-style hosts.)

---

## Phase B — make it real (in progress, no UI rewrite)

The console and event shapes stay identical. Swap the fakes for real infrastructure:

- Replace `src/state.js` (in-memory) with Postgres, keyed per tenant.
- Replace `src/terminal.js` with a real shell in an isolated container (4–5 hero machines on one VM),
  fronted by an egress proxy that enforces the CUE allow-list — so `curl` to an unlisted host genuinely fails.
- A small reporting agent inside each container emits the same `detection` / `mcpRequest` / `cuePushed`
  events this server already broadcasts.
- When Prasanna's Aegis binary + Swagger API are ready, point the server at them and drop the stand-in agent.
