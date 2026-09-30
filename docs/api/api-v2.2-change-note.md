# RayShield API v2.2 — change note for Prasanna

**From:** Kamesh · **Date:** 27 Sep 2026 · **File:** `rayshield-console-api-v2.2-control.yml`
**Purpose:** the API gaps the console needs after the 27 Sep mock review — the "rework Swagger and share gaps" action.

## 1. How the three specs relate

| Spec | File | What it is | Status |
|---|---|---|---|
| v2.0.0 | `openapi.yml` (attached) | The implemented aegis-fleet-api on :8091 — all read endpoints + ingest + MCP registry + devices | Live |
| v2.1.0-draft | `rayshield-console-api-v1.yml` | Console v1 contract: Home, Discover, Protect, Usage, Auth. **Control parked.** Adds auth, pagination, window headers, redaction | Draft, pre-27 Sep |
| **v2.2.0-draft** | `rayshield-console-api-v2.2-control.yml` | **This file.** Un-parks Control and adds the 27 Sep items + rate limits. References the two above, only new/changed ops | New — for you to build |

v2.2 does not restate v2.1 — it's a delta so it's fast to review. Each op is tagged `x-status: new` or `extended`, `x-min-role`, `x-rate-limit`, and `x-screen` (which mock screen it backs).

## 2. What's in v2.2 (24 operations)

- **Discover · MCP & Skills** (Core-gated) — 3 GET: MCPs across endpoints, per-endpoint drill-down, skills. Returns `core_installed:false` when Core is absent so the UI shows "Available with the Core package".
- **Control · Groups** — 5 ops: list/create groups, `PUT …/cue` (group→CUE assignment — the backend support you agreed to add), `GET/PUT …/mcp-policy` (group-level, tool-agnostic MCP gate).
- **Control · CUE** — 7 ops: list (latest version + endpoints-on-older), get/create/update/delete, publish, versions. Create supports `base_cue_id` inheritance; inherited fields come back `inherited:true` and are locked. No writable-mounts field (runtime param). Version-control history is `x-deferred` (post-30 Sep).
- **Control · MCP Bridge** — 6 ops: catalog list, onboard (→ scan), get, approve/block (PATCH), delete, scan-status. Supersedes the raw `/v1/mcps` surface for the console (same store).
- **Protect · Blast Radius (runtime)** — 2 GET: aggregated risky roots + per-execution graph (endpoint → CUE → MCP sandbox → data → DLP). Needs the graph DB migration. **Replaces** design-time `/api/blast-radius`, marked deprecated.

## 3. Rate limits (proposed — please confirm the numbers)

Per authenticated console token unless noted. Every response carries `X-RateLimit-Limit/Remaining/Reset`; breach returns `429` + `Retry-After` + `Error.code = RATE_LIMITED`.

| class | limit | applies to |
|---|---|---|
| read | 120 / min | all GET reads |
| write | 30 / min | POST/PUT/PATCH/DELETE |
| heavy | 20 / min | blast-radius graph, exports, MCP scans |
| auth | 5 / 15 min | login (per email+IP) — from v2.1.0 |
| ingest | 6000 / min | sensor/device ingest (per **device** token, not console) — highest, since hundreds of laptops emit over 7 days |

Rationale: reads are cheap and UI-driven (generous); writes are human actions (low); graph/scan/export are compute-bound (lowest console tier); ingest must not be throttled at fleet scale, so it's a separate high tier on the device token.

## 4. GET/POST bundling (as requested)

Resources are bundled so each has its full verb set on one path family:
- Groups: `GET/POST /groups`, `PUT /groups/{id}/cue`, `GET/PUT /groups/{id}/mcp-policy`
- CUEs: `GET/POST /cues`, `GET/PUT/DELETE /cues/{id}`, `POST /cues/{id}/publish`, `GET /cues/{id}/versions`
- MCP Bridge: `GET/POST /mcp-bridge`, `GET/PATCH/DELETE /mcp-bridge/{id}`, `GET /mcp-bridge/{id}/scan`
- Blast radius: `GET /blast-radius` (roots) + `GET /executions/{id}/graph` (tree)

## 5. Verification of the attached v2.0.0 `openapi.yml`

Findings, most important first:

1. **BLOCKER — `securitySchemes` is at the root level, not under `components`.** In OpenAPI 3.0 it must be `components.securitySchemes`. As written, `bearerAuth` referenced by `POST /api/events` does not resolve and the document fails validation. Move the whole `securitySchemes:` block under `components:`. (v2.1.0 already places it correctly — copy from there.)
2. **No global `security` and no rate limiting.** Only `/api/events` declares auth; every other endpoint is open. Add a top-level `security: [{ bearerAuth: [] }]` and the `429`/`X-RateLimit-*` scheme from v2.2.
3. **Path prefix inconsistency.** MCP registry uses `/v1/…` while everything else uses `/api/…`. The console standardises on `/api/…`; either alias `/v1/mcps` or move it.
4. **`/api/blast-radius` is design-time and lives under the Protect tag but takes a CUE intent file** — this is the mixing the 27 Sep call resolved. v2.2 deprecates it and adds the runtime graph.
5. **No pagination or window headers** on list endpoints (agents, sessions, events cap at fixed row counts). v2.1.0/v2.2 add `cursor`/`limit` + `X-Next-Cursor`/`X-Total-Count`.
6. **Minor:** `Decision.decision` is a free string (v2.1.0 pins it to `allow|block|record`); `/api/sandboxes` vs `/api/sessions` — confirm one canonical session list.

None of 3–6 block the demo; item 1 should be fixed whenever the file is next touched.

## 6. Open items for you (backend)

- Group-level CUE assignment (`PUT /groups/{id}/cue`) — you agreed to add.
- Graph DB migration for the runtime blast radius (roots + tree).
- MCP sandbox data instrumentation (feeds the `data`/`dlp_outcome` nodes in the graph).
- Confirm rate-limit numbers in §3, and whether MCP scan is sync or async (v2.2 models it async: onboard → `scanning` → poll `/scan`).
- CUE signing state — v2.2 assumes published CUEs are signed; expose signed/unsigned if not yet shipped.

## 7. Screenshots

The console home (attached, `01-home-posture.jpg`) confirms the IA every endpoint maps to — the deployment strip, the Discover/Control/Protect planes, and the "249 detections → Open blast radius" entry that `GET /api/protect/blast-radius` backs. I couldn't page to the other artboards from the shared design preview (it's a static render, not the running app); if you open the running console or share the other screens, I'll attach a screen-by-screen endpoint map. Each op already names its screen in `x-screen`.
