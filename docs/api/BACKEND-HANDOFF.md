# RayShield Console API — backend handoff

What the backend needs to build so the existing console can show real data with real sign-in.
The console UI does not change: it calls the endpoints below and expects the shapes in the OpenAPI files.

**Deployment model for now:** one Aegis server per customer (single tenant). The API is already designed
so this is not a dead end; see [Single tenant now, multi-tenant later](#single-tenant-now-multi-tenant-later).

---

## 1. What to read (in this order)

| File | What it is |
|---|---|
| `docs/api/BACKEND-HANDOFF.md` | This page: auth, roles, conventions, the endpoint list, decisions |
| `docs/api/rayshield-console-api-v1.yml` | **v2.1.0** — Auth, Home, Discover, Protect (devices, detections, sessions), Usage |
| `docs/api/rayshield-console-api-v2.2-control.yml` | **v2.2.0** — Control: groups, CUEs, MCP Bridge, blast radius |
| `docs/api/api-v2.2-change-note.md` | What changed from v2.1 to v2.2 |
| `docs/api/me-endpoints.yml` | **Proposed** — developer self-service (`/api/me/*`), inbox and approvals, settings writes, and the extensions to v2.2 (`x-proposed-extensions`) |
| `data/tenants/straits-meridian/access-matrix.json` | Every operation × role → `full` / `read` / `redacted` / `self` / `deny`. **The source of truth for permissions** |
| `data/tenants/straits-meridian/personas.json` | The four roles and their permission flags (`perms`) |
| `data/tenants/straits-meridian/api/<persona>/<METHOD>__<path>.json` | **Example responses per role** (`weiling` = Admin, `arjun` = Security, `priscilla` = CISO, `rahul` = Developer), including the 403 bodies. Match these shapes |
| `scripts/access-check.mjs`, `scripts/storyline-check.mjs` | Acceptance tests you can point at your server (see §8) |

All data in the examples is fictional (Straits Meridian Bank).

---

## 2. Authentication

**Pilot: email + password. Later: SSO (Entra ID / OIDC) without changing any other call.**

| Call | Purpose |
|---|---|
| `POST /api/auth/login` `{ email, password }` | Returns `{ access_token, token_type: "Bearer", expires_in: 900, user }` and sets an `rs_refresh` cookie (HttpOnly, Secure, SameSite=Strict, Path=/api/auth, 8 h). Lock for 15 min after 5 failures (429) |
| `POST /api/auth/refresh` | Exchanges the refresh cookie for a new access token; **rotates** the refresh token |
| `POST /api/auth/logout` | Revokes the refresh token, clears the cookie (204) |
| `GET /api/me` | Current user, role and org. The console shows or hides actions from this |

**Access token (JWT, 15 min, EdDSA or RS256):** `sub`, `email`, `name`, `org_id`, `role`, `aud = "rayshield-console"`, `iat`, `exp`.

- Every other call sends `Authorization: Bearer <access_token>`. No token or expired → **401** `UNAUTHENTICATED`.
- **The server enforces every permission.** The console hiding a button is convenience only.
- Device and sensor ingest tokens must not be able to call console endpoints.
- **Change needed:** the v2.1 role enum is `admin | security | viewer`. Add **`ciso`** and **`developer`**.
- **Proposed addition to `GET /api/me`:** return `permissions: [...]` (the flags in §3) so the console doesn't hard-code role logic. Today the demo injects these into the page.

---

## 3. Roles and permissions

`x-min-role` in the YAMLs is a simple ladder (viewer < security < admin). **That is not enough** for the
bank roles (e.g. the CISO can approve MCP servers but Security can't, and the CISO sees redacted evidence).
Implement **roles → permission sets**, and use `access-matrix.json` per operation.

| Permission | Admin | Security | CISO | Developer |
|---|:-:|:-:|:-:|:-:|
| Read the whole org (`viewAll`) | ✓ | ✓ | ✓ | own data only |
| Set governance status (`setStatus`) | ✓ | ✓ | ✓ | |
| Approve / block / suspend MCP, set access duration (`decideMcp`) | ✓ | | ✓ | |
| Onboard MCP (`onboardMcp`) | ✓ | | ✓ | |
| Deboard MCP (`removeMcp`) | ✓ | | ✓ | |
| Create / edit / publish CUE (`editCue`, `publishCue`) | ✓ | | ✓ | |
| Draft a CUE and send it for approval (`draftCue`) | | ✓ | | |
| Retire / delete CUE (`deleteCue`) | ✓ | | | |
| Group MCP policy, device groups, edit group (`assignPolicy`) | ✓ | | ✓ | |
| Create group (`createGroup`) | ✓ | | | |
| Settings writes (`settingsWrite`) | ✓ | | | |

**Access levels per operation** (`access-matrix.json`):

| Level | Meaning |
|---|---|
| `full` | Read and write |
| `read` | Read only |
| `redacted` | Read, with `x-viewer-redaction` applied (CISO): `teaser` = rule label + target type; every `evidence.*` key `null` except `type`; `chain[].detail` = null; `origin.initial_prompt` = null |
| `self` | Only the caller's own devices, sessions, detections and requests. Developer ↔ device mapping comes from the directory (device owner = user) |
| `deny` | **403** `FORBIDDEN` with the error body below |

Approvals: anyone missing a permission can ask through `POST /api/workflows`; approving runs the same write
as the approver (see `me-endpoints.yml` and `src/workflows.js` in the demo for reference behaviour).
Admin and CISO act directly, including on their own drafts. Nobody decides their own request.

---

## 4. Conventions (all endpoints)

- **Errors:** `{ "error": "human sentence", "code": "…", "request_id": "req_…" }`. Codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INVALID_PARAMETER` (400), `CONFLICT` (409), plus 429 on login.
- **Time:** epoch **seconds** (`int64`) in bodies and query params, except the proposed approval endpoints, which use ISO-8601.
- **Windows:** `from` / `to` query params, default last 7 days, max span 7 days. Echo what was applied in `X-Window-From`, `X-Window-To`, and the newest event in `X-Data-As-Of` (drives the freshness banner).
- **Paging:** `cursor` param; `X-Next-Cursor` (absent on the last page), optional `X-Total-Count`. List CORS headers in `Access-Control-Expose-Headers`.
- **Bodies:** bare arrays or objects (no `{ data: … }` envelope).
- **IDs:** prefixed strings (`usr_…`, `grp_…`, `cue_…`, `mcp_…`, `det_…`, `wf_…`). Use globally unique IDs (ULID/UUID) behind the prefix.
- **Never return raw card numbers or NRICs.** Mask at the source (`4539 •••• •••• 1187`, `S•••••••D`).

---

## 5. Endpoint list

71 operations. ✓ = full · read · redacted · own = self scope · — = 403.
`proposed` = in `me-endpoints.yml`, not yet in v2.1/v2.2.

**Auth**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `login` | `POST /api/auth/login` | v2.1 | ✓ | ✓ | ✓ | ✓ |
| `refresh` | `POST /api/auth/refresh` | v2.1 | ✓ | ✓ | ✓ | ✓ |
| `logout` | `POST /api/auth/logout` | v2.1 | ✓ | ✓ | ✓ | ✓ |
| `getMe` | `GET /api/me` | v2.1 | read | read | read | own |

**Home**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getHome` | `GET /api/home` | v2.1 | read | read | read | — |

**Discover**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getDiscoverySummary` | `GET /api/discovery/summary` | v2.1 | read | read | read | own |
| `listServices` | `GET /api/discovery/by_service` | v2.1 | read | read | read | own |
| `getService` | `GET /api/discovery/services/{service_id}` | v2.1 | read | read | read | own |
| `setServiceStatus` | `PUT /api/discovery/services/{service_id}/status` | v2.1 | ✓ | ✓ | ✓ | — |
| `listDiscoveryEndpoints` | `GET /api/discovery/by_endpoint` | v2.1 | read | read | read | own |
| `getDiscoveryEndpoint` | `GET /api/discovery/endpoints/{endpoint_id}` | v2.1 | read | read | read | own |
| `getUsageGraph` | `GET /api/discovery/usage-graph` | v2.1 | read | read | read | — |
| `getSensors` | `GET /api/sensors` | v2.1 | read | read | read | — |
| `listDiscoveredMcps` | `GET /api/discovery/mcps` | v2.2 | read | read | read | own |
| `getEndpointMcps` | `GET /api/discovery/mcps/{endpoint_id}` | v2.2 | read | read | read | own |
| `listDiscoveredSkills` | `GET /api/discovery/skills` | v2.2 | read | read | read | own |

**Devices**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getFleetSummary` | `GET /api/devices/summary` | v2.1 | read | read | read | own |
| `listDevices` | `GET /api/devices` | v2.1 | read | read | read | own |
| `getDevice` | `GET /api/devices/{id}` | v2.1 | read | read | read | own |
| `listDeviceEvents` | `GET /api/devices/{id}/events` | v2.1 | read | read | read | own |

**Detections**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getDetectionsSummary` | `GET /api/detections/summary` | v2.1 | read | read | read | own |
| `listDetections` | `GET /api/detections` | v2.1 | read | read | redacted | own |
| `getDetection` | `GET /api/detections/{detection_id}` | v2.1 | read | read | redacted | own |

**Sessions and blast radius**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getSessionActivity` | `GET /api/session/{sid}/activity` | v2.1 | read | read | redacted | own |
| `listSessions` | `GET /api/sessions` | v2.1 | read | read | read | own |
| `getSessionsSummary` | `GET /api/sessions/summary` | v2.1 | read | read | read | own |
| `listBlastRoots` | `GET /api/protect/blast-radius` | v2.2 | read | read | read | own |
| `getBlastGraph` | `GET /api/protect/executions/{execution_id}/graph` | v2.2 | read | read | read | own |
| `blastRadiusDesignTimeDeprecated` | `GET /api/blast-radius` | v2.2 | read | read | read | — |

**Usage**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getUsageSummary` | `GET /api/usage/summary` | v2.1 | read | read | read | own |
| `getUsageByModel` | `GET /api/usage/by_model` | v2.1 | read | read | read | own |
| `getUsageByGroup` | `GET /api/usage/by_group` | v2.1 | read | read | read | — |
| `getUsageByUser` | `GET /api/usage/by_user` | v2.1 | read | read | read | own |
| `getUsageBudgets` | `GET /api/usage/budgets` | v2.1 | read | read | read | own |

**Control · Groups**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `listGroups` | `GET /api/control/groups` | v2.2 | read | read | read | — |
| `createGroup` | `POST /api/control/groups` | v2.2 | ✓ | — | — | — |
| `assignGroupCue` | `PUT /api/control/groups/{id}/cue` | v2.2 | ✓ | — | ✓ | — |
| `getGroupMcpPolicy` | `GET /api/control/groups/{id}/mcp-policy` | v2.2 | read | read | read | — |
| `setGroupMcpPolicy` | `PUT /api/control/groups/{id}/mcp-policy` | v2.2 | ✓ | — | ✓ | — |

**Control · CUEs**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `listCues` | `GET /api/control/cues` | v2.2 | read | read | read | — |
| `createCue` | `POST /api/control/cues` | v2.2 | ✓ | — | ✓ | — |
| `getCue` | `GET /api/control/cues/{id}` | v2.2 | read | read | read | — |
| `updateCue` | `PUT /api/control/cues/{id}` | v2.2 | ✓ | — | ✓ | — |
| `deleteCue` | `DELETE /api/control/cues/{id}` | v2.2 | ✓ | — | — | — |
| `publishCue` | `POST /api/control/cues/{id}/publish` | v2.2 | ✓ | — | ✓ | — |
| `listCueVersions` | `GET /api/control/cues/{id}/versions` | v2.2 | read | read | read | — |

**Control · MCP Bridge**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `listBridgeMcps` | `GET /api/control/mcp-bridge` | v2.2 | read | read | read | — |
| `onboardMcp` | `POST /api/control/mcp-bridge` | v2.2 | ✓ | — | ✓ | — |
| `getBridgeMcp` | `GET /api/control/mcp-bridge/{id}` | v2.2 | read | read | read | — |
| `decideBridgeMcp` | `PATCH /api/control/mcp-bridge/{id}` | v2.2 | ✓ | — | ✓ | — |
| `removeBridgeMcp` | `DELETE /api/control/mcp-bridge/{id}` | v2.2 | ✓ | — | ✓ | — |
| `getBridgeScan` | `GET /api/control/mcp-bridge/{id}/scan` | v2.2 | read | read | read | — |

**Developer self-service**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getMyAccess` | `GET /api/me/access` | me (proposed) | own | own | own | own |
| `listMyMcpRequests` | `GET /api/me/mcp-requests` | me (proposed) | own | own | own | own |
| `createMyMcpRequest` | `POST /api/me/mcp-requests` | me (proposed) | own | own | own | own |
| `listMyDevices` | `GET /api/me/devices` | me (proposed) | own | own | own | own |
| `listMySessions` | `GET /api/me/sessions` | me (proposed) | own | own | own | own |
| `listMyDetections` | `GET /api/me/detections` | me (proposed) | own | own | own | own |

**Settings**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `getSettingsSensors` | `GET /api/settings/sensors` | proposed | read | read | read | — |
| `updateSensor` | `PUT /api/settings/sensors/{id}` | proposed | ✓ | — | — | — |
| `getSettingsDirectory` | `GET /api/settings/directory` | proposed | read | read | read | — |
| `updateDirectory` | `PUT /api/settings/directory` | proposed | ✓ | — | — | — |
| `listConsoleUsers` | `GET /api/settings/users` | proposed | read | read | read | — |
| `updateConsoleUser` | `PUT /api/settings/users/{id}` | proposed | ✓ | — | — | — |

**Inbox and approvals**

| Operation | Method and path | Spec | Admin | Security | CISO | Developer |
|---|---|---|:-:|:-:|:-:|:-:|
| `listInbox` | `GET /api/inbox` | me (proposed) | own | own | own | own |
| `markInboxRead` | `POST /api/inbox/read` | me (proposed) | own | own | own | own |
| `submitWorkflow` | `POST /api/workflows` | me (proposed) | — | own | own | own |
| `getWorkflow` | `GET /api/workflows/{id}` | me (proposed) | read | read | read | own |
| `decideWorkflow` | `POST /api/workflows/{id}/decision` | me (proposed) | ✓ | — | ✓ | — |
| `recommendWorkflow` | `POST /api/workflows/{id}/recommendation` | me (proposed) | — | ✓ | — | — |
| `withdrawWorkflow` | `POST /api/workflows/{id}/withdraw` | me (proposed) | — | own | own | own |

**Do not build** (demo only): `POST /api/demo/reset`, `GET/POST /api/console/state`. In the demo the
console saves whole screens through `/api/console/state`; the real backend replaces that with the
proper create/update calls above (groups, CUEs, group MCP policy, settings, device moves).

**Pilot order:** Auth + `/api/me` → Home → Control (CUEs, MCP Bridge, groups) → Detections → Inbox and
approvals → Developer self-service → Devices/sessions → Discover → Usage → Settings.

---

## 6. Decisions and gaps to close with the backend developer

| # | Item | Proposed answer |
|---|---|---|
| 1 | Role enum | Add `ciso`, `developer` (§2) |
| 2 | `GET /api/me` permissions | Add `permissions: [...]` (§2) |
| 3 | MCP "awaiting decision" | v2.2 `BridgeMcp.status` has only `scanning | approved | blocked`. Add `awaiting_decision`, or keep `scanning` + `findings.scan_complete` |
| 4 | Suspend MCP | Add `suspended` status, or keep `blocked` + `suspended: true` (demo) |
| 5 | Time-limited MCP access | `access_ttl_minutes` / `access_expires_at` on decide; `expires` on group MCP policy; server job removes expired grants |
| 6 | DLP mask action | Needed for `dlp-mask-query-results` (mask columns in tool results instead of blocking) |
| 7 | `DetectionFamily.owasp` | Make nullable (several bank rules have no OWASP id) |
| 8 | Settings writes, `/api/me/*`, inbox/approvals | Promote from `me-endpoints.yml` (proposed) into the main spec |
| 9 | Agent-facing API (separate from the console) | Enrolment, heartbeat/inventory, events/detections, CUE fetch + applied-version ack, revocation list. Not in these files yet |

---

## 7. Single tenant now, multi-tenant later

**Short answer: no API signatures change.** The tenant is never in the URL. It comes from the token
(`org_id` claim) and `GET /api/me` returns `org`. Keep it that way.

**Decide now (cheap now, expensive to retrofit):**

1. Put `tenant_id` (= `org_id`) on every table and filter every query by it, even with one tenant (Postgres row-level security works well).
2. Globally unique IDs; uniqueness rules scoped per tenant (e.g. group name unique *within* a tenant).
3. Per-tenant config in the database, not environment variables: SSO settings, sensors, model rates, budgets, frameworks.
4. Per-tenant keys: CUE and evidence signing keys carry a `key_id` per tenant (the demo uses `aegis-smb-2026-09`).
5. Agent enrolment tokens and ingest credentials bound to a tenant.
6. Live event stream, logs and stored files tagged and filtered by tenant.
7. One user belongs to one org. (Multi-org users would need an org switcher, the only thing that could add an API parameter.)

**What multi-tenant adds later (no change to these console APIs):**
- Finding the tenant at sign-in on a shared host: email domain or subdomain → tenant, per-tenant SSO.
- A vendor support / super-admin role, kept out of customer audit views.
- Per-tenant rate limits, quotas, billing.
- Per-tenant data residency or dedicated databases for customers who require it (banks often do: a dedicated deployment per customer is the same API).

---

## 8. Acceptance tests

The demo's checks run against any server that speaks this API:

```bash
BASE=https://your-server npm run check:access
```

```bash
BASE=https://your-server npm run check:storyline
```

They sign in as the four example users and compare every route's status with `access-matrix.json`,
then run the story end to end. Two things to adjust for a real backend:
- They sign in with `{ "username": … }` and cookies; the spec uses `{ "email", "password" }` and a Bearer token.
- They expect the fictional seed data (Straits Meridian). Use a seeded test tenant, or keep only the permission checks.
