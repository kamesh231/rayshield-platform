# APIs needed for the console to show real data

This is my best attempt at listing the APIs the console needs, worked out from the demo. Please treat
it as a starting point: you know the backend far better, so anything that doesn't fit, or a simpler way
to do it, is very welcome.

## 1. How to read this

- **Status**
  - **In spec**: already in our API files (v2.1 or v2.2).
  - **Proposed**: drafted in `docs/api/me-endpoints.yml`, not yet agreed.
  - **Needed, not in spec yet**: the console has a screen that saves this, but there's no API for it yet. These are the gaps I found when comparing the console's buttons with the API files.
  - **+ small change**: an existing API that needs one extra field or option.
- **Who can use it**: the four roles are Admin, Security, CISO and Developer. "Own data only" means a developer sees only their own devices, sessions and requests. "CISO sees evidence redacted" means rule names and targets, but no prompts or matched content.
- **Totals**: 99 console APIs. 51 are in the spec (3 of them need a small change), 19 are proposed, and 29 are new (20 in §2, 9 in §3). §3 also asks for one change to how all list and summary APIs take time ranges.
- **Shapes**: the request and response shapes for the in-spec and proposed APIs are in `docs/api/*.yml`. Example responses for each role are in `data/tenants/straits-meridian/api/<role>/` (fictional data).

## 2. Console APIs

### Sign-in and current user

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Sign in (email + password for the pilot; SSO later) | Everyone | In spec (v2.1) |
| `POST` | `/api/auth/refresh` | Get a new access token from the refresh cookie | Everyone | In spec (v2.1) |
| `POST` | `/api/auth/logout` | Sign out | Everyone | In spec (v2.1) |
| `GET` | `/api/me` | Current user and role. **Change:** add a `permissions` list, and the roles `ciso` and `developer` | Everyone | In spec (v2.1) + small change |

### Home

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/home` | Home rows per plane plus the Needs-attention list | Admin, Security, CISO | In spec (v2.1) |

### Discover

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/discovery/summary` | Overview tiles | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/discovery/by_service` | AI services list | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/discovery/services/{service_id}` | Service side panel | Everyone (Developer: own data only) | In spec (v2.1) |
| `PUT` | `/api/discovery/services/{service_id}/status` | Set a service's governance status | Admin, Security, CISO | In spec (v2.1) |
| `GET` | `/api/discovery/by_endpoint` | Endpoints list | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/discovery/endpoints/{endpoint_id}` | Endpoint side panel | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/discovery/usage-graph` | "Who uses which AI service" widget | Admin, Security, CISO | In spec (v2.1) |
| `GET` | `/api/sensors` | Sensors & coverage page, freshness banner and directory status | Admin, Security, CISO | In spec (v2.1) |
| `GET` | `/api/discovery/mcps` | MCPs observed across endpoints | Everyone (Developer: own data only) | In spec (v2.2) |
| `GET` | `/api/discovery/mcps/{endpoint_id}` | MCP + skills breakdown for one endpoint | Everyone (Developer: own data only) | In spec (v2.2) |
| `GET` | `/api/discovery/skills` | Skills observed across endpoints | Everyone (Developer: own data only) | In spec (v2.2) |

### Devices (fleet)

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/devices/summary` | Fleet tiles | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/devices` | Fleet list | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/devices/{id}` | Device page header | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/devices/{id}/events` | Decision feed for one device, newest first | Everyone (Developer: own data only) | In spec (v2.1) |
| `PUT` | `/api/devices/{id}/group` | Move a device to another group | Admin, CISO | Needed, not in spec yet |

### Detections

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/detections/summary` | Detections page | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/detections` | Detection list | Everyone (CISO sees evidence redacted; Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/detections/{detection_id}` | Detection detail | Everyone (CISO sees evidence redacted; Developer: own data only) | In spec (v2.1) |

### Sessions and blast radius

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/sessions` | Execution sessions list | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/sessions/summary` | Counts for the outcome filter chips on the Sessions page | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/session/{sid}/activity` | Session detail | Everyone (CISO sees evidence redacted; Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/protect/blast-radius` | Aggregated risky/blocked executions as root nodes | Everyone (Developer: own data only) | In spec (v2.2) |
| `GET` | `/api/protect/executions/{execution_id}/graph` | One execution as a tree | Everyone (Developer: own data only) | In spec (v2.2) |

### Usage and budgets

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/usage/summary` | Usage tiles | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/usage/by_model` | "By model" table; the console groups rows by provider for "By provider" | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/usage/by_group` | "Top groups" table | Admin, Security, CISO | In spec (v2.1) |
| `GET` | `/api/usage/by_user` | "Top people" table | Everyone (Developer: own data only) | In spec (v2.1) |
| `GET` | `/api/usage/budgets` | Budgets page | Everyone (Developer: own data only) | In spec (v2.1) |
| `PUT` | `/api/usage/budgets/{group_id}` | Set a group’s daily cap and mode (hard stop or warn) | Admin | Needed, not in spec yet |

### Control · Groups

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/control/groups` | Groups with member count, assigned CUE and recert date | Admin, Security, CISO | In spec (v2.2) |
| `POST` | `/api/control/groups` | Create a group | Admin | In spec (v2.2) |
| `PUT` | `/api/control/groups/{id}/cue` | Assign (deploy) a CUE to a group | Admin, CISO | In spec (v2.2) |
| `GET` | `/api/control/groups/{id}/mcp-policy` | Group-level MCP gate (tool-agnostic), independent of CUE files | Admin, Security, CISO | In spec (v2.2) |
| `PUT` | `/api/control/groups/{id}/mcp-policy` | Set the group's allowed/denied MCPs. **Change:** add an expiry per MCP server (time-limited access) | Admin, CISO | In spec (v2.2) + small change |
| `PATCH` | `/api/control/groups/{id}` | Edit a group: name, description, owner, deactivate or reactivate | Admin, CISO | Needed, not in spec yet |
| `POST` | `/api/control/groups/{id}/recertify` | Recertify a group (sets the next review date) | Admin, CISO | Needed, not in spec yet |
| `POST` | `/api/control/groups/{id}/members` | Add members (people or devices) | Admin, CISO | Needed, not in spec yet |
| `DELETE` | `/api/control/groups/{id}/members/{member_id}` | Remove a member | Admin, CISO | Needed, not in spec yet |
| `PUT` | `/api/control/groups/{id}/policies` | Attach or detach policies on a group | Admin, CISO | Needed, not in spec yet |
| `POST` | `/api/control/groups/import` | Map directory groups to groups (`dry_run: true` to validate first) | Admin | Needed, not in spec yet |

### Control · Policies

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/control/policies` | List policies (DLP and access rules) with mode and where they apply | Admin, Security, CISO | Needed, not in spec yet |
| `POST` | `/api/control/policies` | Create a policy | Admin, CISO | Needed, not in spec yet |
| `PUT` | `/api/control/policies/{id}` | Edit a policy, switch Enforce / Record, deactivate | Admin, CISO | Needed, not in spec yet |

### Control · CUEs

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/control/cues` | CUE list | Admin, Security, CISO | In spec (v2.2) |
| `POST` | `/api/control/cues` | Create a CUE (optionally inherit a base CUE | Admin, CISO | In spec (v2.2) |
| `GET` | `/api/control/cues/{id}` | CUE detail for the GUI editor | Admin, Security, CISO | In spec (v2.2) |
| `PUT` | `/api/control/cues/{id}` | Edit a CUE's editable (non-inherited) fields | Admin, CISO | In spec (v2.2) |
| `DELETE` | `/api/control/cues/{id}` | Delete a CUE | Admin | In spec (v2.2) |
| `POST` | `/api/control/cues/{id}/publish` | Publish the draft | Admin, CISO | In spec (v2.2) |
| `GET` | `/api/control/cues/{id}/versions` | Version list | Admin, Security, CISO | In spec (v2.2) |
| `POST` | `/api/control/cues/{id}/retire` | Retire a CUE (kept for history, no longer assignable) | Admin | Needed, not in spec yet |
| `POST` | `/api/control/cues/{id}/rollback` | Undo a publish within 10 minutes (back to the previous version) | Admin, CISO | Needed, not in spec yet |
| `POST` | `/api/control/cues/validate` | Check a handwritten CUE: schema, onboarded MCPs only, can’t weaken the base | Admin, Security, CISO | Needed, not in spec yet |
| `GET` | `/api/control/cues/{id}/endpoints` | Which endpoints run which version (“Show endpoints”) | Admin, Security, CISO | Needed, not in spec yet |

### Control · MCP Bridge

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/control/mcp-bridge` | Sandboxed-MCP catalog with status and group access | Admin, Security, CISO | In spec (v2.2) |
| `POST` | `/api/control/mcp-bridge` | Onboard an MCP | Admin, CISO | In spec (v2.2) |
| `GET` | `/api/control/mcp-bridge/{id}` | MCP detail | Admin, Security, CISO | In spec (v2.2) |
| `PATCH` | `/api/control/mcp-bridge/{id}` | Approve / block an onboarded MCP. **Change:** add suspend / reinstate, and how long access lasts when approving for a group | Admin, CISO | In spec (v2.2) + small change |
| `DELETE` | `/api/control/mcp-bridge/{id}` | Remove an MCP from the catalog | Admin, CISO | In spec (v2.2) |
| `GET` | `/api/control/mcp-bridge/{id}/scan` | Poll onboarding scan status/findings | Admin, Security, CISO | In spec (v2.2) |

### Inbox and approvals

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/inbox` | Approvals waiting for me, my own requests, and my notices | Everyone (own data) | Proposed |
| `POST` | `/api/inbox/read` | Mark inbox updates as read | Everyone (own data) | Proposed |
| `POST` | `/api/workflows` | Ask for approval when your role can’t make a change | Security, CISO, Developer | Proposed |
| `GET` | `/api/workflows/{id}` | One request with its history | Everyone (Developer: own data only) | Proposed |
| `POST` | `/api/workflows/{id}/decision` | Approve (runs the change as the approver), reject, or send back with a note | Admin, CISO | Proposed |
| `POST` | `/api/workflows/{id}/recommendation` | Security recommends approve or block on an MCP request | Security | Proposed |
| `POST` | `/api/workflows/{id}/withdraw` | Requester withdraws a request | Security, CISO, Developer (Developer: own data only) | Proposed |

### Developer self-service

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/me/access` | My tools, models, approved MCP servers, egress, assigned CUE + version and budget | Everyone (own data) | Proposed |
| `GET` | `/api/me/mcp-requests` | MCP servers I asked for and where each stands | Everyone (own data) | Proposed |
| `POST` | `/api/me/mcp-requests` | Ask for an MCP server | Everyone (own data) | Proposed |
| `GET` | `/api/me/devices` | My devices | Everyone (own data) | Proposed |
| `GET` | `/api/me/sessions` | My recent agent sessions | Everyone (own data) | Proposed |
| `GET` | `/api/me/detections` | My detections (7 days) with why it was blocked and how to fix it | Everyone (own data) | Proposed |

### Settings

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/settings/sensors` | Same body as getSensors | Admin, Security, CISO | Proposed |
| `PUT` | `/api/settings/sensors/{id}` | Edit a discovery sensor | Admin | Proposed |
| `GET` | `/api/settings/directory` | Directory (Entra ID) connection and mapping | Admin, Security, CISO | Proposed |
| `PUT` | `/api/settings/directory` | Edit the directory connection | Admin | Proposed |
| `GET` | `/api/settings/users` | Console users and their roles | Admin, Security, CISO | Proposed |
| `PUT` | `/api/settings/users/{id}` | Change a console user’s role | Admin | Proposed |
| `POST` | `/api/settings/directory/sync` | Sync the directory now | Admin | Needed, not in spec yet |
| `POST` | `/api/settings/users` | Add a console user with a role | Admin | Needed, not in spec yet |
| `DELETE` | `/api/settings/users/{id}` | Remove a console user | Admin | Needed, not in spec yet |
| `GET` | `/api/settings/rates` | Model prices used for cost | Admin, Security, CISO | Needed, not in spec yet |
| `PUT` | `/api/settings/rates` | Edit model prices | Admin | Needed, not in spec yet |

## 3. Time ranges, trends, search and exports

Today the spec allows **at most 7 days** per request (`from`/`to`, otherwise `400 WINDOW_TOO_LARGE`) and
has no time-series. The console already offers longer and finer ranges:
- **Usage:** 7d / 30d / 90d, with spend-over-time charts.
- **Device decisions:** 1h / 24h / 7d / 30d.
- **Discover overview:** Live, hourly and daily views.

So I think we'd need the following.

**a) One change to all list and summary APIs** (the 24 that already take `from`/`to`):

| Change | Detail |
|---|---|
| Longer windows | Allow up to **90 days** (today 7). Default stays the last 7 days |
| Preset shortcut | `window=1h \| 24h \| 7d \| 30d \| 90d` as an alternative to `from`/`to` |
| Previous-period comparison | Every summary also returns the same-length window before it (`previous`), for the “vs last week / last month” deltas. Some summaries already do this for 7 days |
| Applied window | Keep echoing the window actually used in `X-Window-From` / `X-Window-To` and the freshness in `X-Data-As-Of` |

**b) New APIs**

| Method | Path | What it’s for | Who can use it | Status |
|---|---|---|---|---|
| `GET` | `/api/discovery/trend` | Requests, endpoints and services over time (`bucket=hour \| day`) for the overview charts | Admin, Security, CISO | Needed, not in spec yet |
| `GET` | `/api/detections/trend` | Detections over time, split by rule, severity or outcome | Everyone (Developer: own data only) | Needed, not in spec yet |
| `GET` | `/api/usage/trend` | Spend and tokens over time, split by provider, model or group (the 7d / 30d / 90d charts) | Admin, Security, CISO | Needed, not in spec yet |
| `GET` | `/api/devices/{id}/trend` | One device’s allowed / blocked / recorded decisions over time | Everyone (Developer: own devices only) | Needed, not in spec yet |
| `GET` | `/api/stream` | Live updates (server-sent events): the Live view, new detections, approvals, CUE pushes | Everyone (filtered to what each role may see) | Needed, not in spec yet (the demo has it) |
| `GET` | `/api/search` | Search across people, devices, AI services, detections, sessions, MCP servers and CUEs (`q`, `types`, `from`, `to`) | Everyone (filtered by role) | Needed, not in spec yet (nice to have; each list already has `q`) |
| `GET` | `/api/audit` | Who changed what and when (approvals, publishes, suspensions, role changes), with time range and filters | Admin, Security, CISO | Needed, not in spec yet |
| `POST` | `/api/exports` | Start an export of detections, sessions, usage or audit for any date range (`csv` or `json`) | Admin, Security, CISO | Needed, not in spec yet |
| `GET` | `/api/exports/{id}` | Export status and a short-lived download link | Whoever started it | Needed, not in spec yet |

If it’s simpler on the backend side, the four `trend` APIs could be one
`GET /api/metrics/timeseries?metric=…&group_by=…&bucket=…`; either works for the console.

## 4. APIs for data coming in from devices and sensors

The console APIs above only work once real data is flowing in. These aren't in our files yet. If the
Aegis server already has them, we can simply reuse those.

| Method | Path (suggested) | What it’s for | Called by |
|---|---|---|---|
| `POST` | `/agent/enroll` | Register a laptop or VM with a one-time enrolment token; returns its identity | Endpoint agent |
| `POST` | `/agent/heartbeat` | Agent health, version, installed AI tools, MCP configs and skills | Endpoint agent |
| `POST` | `/agent/events` | Batches of session events and detections (evidence already masked) | Endpoint agent, model gateway |
| `GET` | `/agent/cue?tool=claude-code` | The signed CUE that applies to this user and device (returns “not modified” if unchanged) | Endpoint agent |
| `POST` | `/agent/cue/ack` | “I’m now running version N”; drives the “endpoints on an older version” count | Endpoint agent |
| `GET` | `/agent/revocations` | Suspended or deboarded MCP servers and revoked CUE versions, for the kill switch | Endpoint agent |
| `POST` | `/ingest/discovery` | Batches of proxy or DNS log rows from network sensors (for example a Zscaler export) | Discovery sensor |
| `POST` | `/ingest/usage` | Tokens and cost per session (gateway logs or Claude Code telemetry) | Model gateway |

## 5. Not needed

`POST /api/demo/reset` and `GET/POST /api/console/state` exist only for the demo. In the demo the console
saves whole screens in one call; the real backend would use the individual APIs above instead.

## 6. Assumptions

These are the assumptions behind the list. Happy to change any of them.

**One tenant per account, for now**
- Each customer has its own account, and for now each account holds one tenant.
- The tenant comes from the signed-in user's token (`org_id`), never from the URL. So **no API in this list changes** if we later put several customers on one server.
- To keep that door open cheaply, it would help to:
  - store a tenant id on every table and filter by it, even with one tenant;
  - use globally unique ids, with names unique only within a tenant (for example group names);
  - keep per-customer settings (SSO, sensors, model rates, budgets) in the database rather than in environment variables;
  - give each customer its own signing key and its own device enrolment tokens.
- One user belongs to one organisation. A user switching between organisations is the only case I can think of that would add an API parameter.
- Going multi-tenant later would mean extra work outside these APIs: finding the customer at sign-in, a support role for our team, per-customer limits and billing. A bank may still want its own dedicated server, which works with the same APIs.

**Sign-in and permissions**
- **Sign-in:**
  - Email and password for the pilot. Sign-in returns a 15-minute access token, plus a refresh cookie that rotates.
  - The token carries user id, email, name, organisation and role.
  - SSO (Entra ID) can replace the password step later without changing the other APIs.
- **Roles:** four roles: Admin, Security, CISO and Developer. The current role list has admin, security and viewer, so `ciso` and `developer` would need adding.
- **Permission checks:** the server checks permissions on every call; the console hiding a button is only a convenience. The per-role table is in `data/tenants/straits-meridian/access-matrix.json`. It needs per-permission checks rather than a simple role ladder, because the CISO can approve MCP servers but Security can't, and the CISO sees redacted evidence.
- **Approvals:** Admin and CISO act directly, including on their own drafts. Others send changes for approval through `POST /api/workflows`, and nobody approves their own request.

**Conventions**
- **Errors:** `{ "error", "code", "request_id" }`, with codes `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_PARAMETER` and `CONFLICT`.
- **Time:** epoch seconds. Lists take a `from`/`to` window or a `window` preset (last 7 days by default, up to 90 days) and use cursor paging, with the details in response headers.
- **How far back:** the console can query the last 90 days directly. Anything older comes from exports, kept for as long as the bank's retention rules require. Long-range summaries and trends come from pre-computed daily and hourly rollups, so 30- and 90-day views stay fast.
- **Sensitive data:** card numbers and NRICs are never stored or returned in full; they're masked where they're captured.
