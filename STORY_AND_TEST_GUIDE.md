# Straits Meridian Bank demo: storyline and test guide

A step-by-step guide for anyone running or testing the demo: how to start it, the story beat by
beat, the terminal simulations, and **what should happen**, both when things are allowed
(positive cases) and when they must be refused (negative cases).

> **Fictional tenant.** Straits Meridian Bank, its people and its data are made up. Every screen
> reads *Demo data · fictional*. Card numbers and NRICs only ever appear masked
> (`4539 •••• •••• 1187`, `S•••••••D`). The terminal is a **simulation**: nothing executes, it
> returns scripted output and raises the same events a real agent would.

Logins and role permissions are in **[LOGINS.md](LOGINS.md)**. Every password is `demo`. The sign-in page itself does not show accounts or passwords.

---

## 1. Start the demo

You need Node.js 18 or newer. From the project folder:

```bash
npm install
```

```bash
npm run build:console
```

```bash
npm run start:bank
```

Open **http://localhost:3000**. You should see the sign-in page titled *demo tenant · Straits Meridian Bank (fictional)*.

**Before every run:** sign in as `weiling`, click **Reset demo** (bottom-right bar) and confirm.
This returns the tenant to the seed. Changes otherwise persist across sign-outs and restarts in
`data/tenants/straits-meridian/live-state.json`.

### Windows to open

A browser holds one sign-in at a time, so use separate browsers or private windows:

| Window | Sign in as | Shows |
|---|---|---|
| **A** | `priscilla`: CISO | Console, exec home |
| **B** | `rahul`: Developer | `/me` (My access) → **Terminal** link |
| **C** | `arjun`: Security | Console, Security home |
| *(end)* | `weiling`: Admin | Console, Admin home + Reset demo |

---

## 2. The story (about 6 minutes)

Each beat lists what to do and what you should see. Numbers are for a freshly reset demo.

### Beat 1: the CISO frames it (window A, `priscilla`)
**Do:** open **Home**.

**Expect:**
- Deployment strip: **Step 3 of 4**. Deploy Shield ✓, Install Core ✓, **Add MCP Bridge (current stage)**, Full containment (next).
- **Governance:** Services governed **23 of 27** · Shadow share **3.1%** (subtitle "5.4% in the previous 7 days") · Prohibited services blocked **3** (DeepSeek · Kimi · Qwen Chat).
- **Protection:** Endpoints enforcing **90%** (371 of 412) · Critical detections contained **17 / 17** · Card or NRIC records that left the bank **0**.
- **Decisions:** Decisions awaiting you **3** · Frameworks tracked **4** · MCP servers onboarded **4**.
- Banner: **7** DLP-blocked agent runs in the last 7 days.
- *Needs attention*: three **DECISION** rows (confluence, Payments CUE v4, unlabelled services) and four **FRAMEWORK** rows. The frameworks are named only, "mapping to be confirmed".

### Beat 2: the developer works (window B, `rahul`)
**Do:** click **Terminal** (or go to http://localhost:3000/terminal). Type each command and press Enter:

```text
aegis run claude-code --src ./settlement-recon --writable
```

**Expect:**

```text
aegis ▸ claude-code/payments-eng@v3 (signed · ed25519 · aegis-smb-2026-09) — server-verified
     inherits Bank baseline v5 (inherited fields are locked)
     ✓ egress (inherited from Bank baseline): api.anthropic.com, registry.npmjs.org, pypi.org, github.straitsmeridian.example
     ✓ DLP Enforce: dlp-card-pan, dlp-nric, dlp-secrets, dlp-swift-mt (inherited from Bank baseline)
     ✓ MCP via Aegis Bridge: postgres-mcp, github-enterprise, jira
     ✓ writable path (runtime --src/--writable, not part of the CUE): ./settlement-recon
aegis ▸ agent ready.
```

```text
claude "find why yesterday's card settlement is off by SGD 1,240"
```

**Expect:**

```text
  result cards.txn_ledger · 1,240 rows with PAN + NRIC columns
BLOCKED — card PAN + NRIC in the tool result (dlp-card-pan, dlp-nric · Enforce)
     match:  4539 •••• •••• 1187 · S•••••••D (masked at source)
     dest:   api.anthropic.com — nothing transmitted
```

- The right-hand *Live from Aegis* feed shows **critical detection · CARD-PAN**.
- Windows A and C get a toast: 🔴 *Card data blocked on LT-SG-2231 — new critical detection*. The **Detections** badge goes **17 → 18**.
- Click **My access (/me)** → *My blocked events* lists this block **first**, with *Why* and *How to fix*.

### Beat 3: Security triages (window C, `arjun`)

| Do | Expect |
|---|---|
| Home → click *Card data blocked on LT-SG-2231 … det_01JA4K9PAN1* | Detection page: **CRITICAL**, **↑ Escalated**. Matched content `pan=4539 •••• •••• 1187, nric=S•••••••D`, signed evidence `aegis-smb-2026-09`, OWASP "—". |
| Protect → **Blast radius** → **Rahul Iyer** (LT-SG-2231) | Tree: LT-SG-2231 → `claude-code/payments-eng@v3` → postgres-mcp (Aegis Bridge) → .env credentials → **cards.txn_ledger — 1,240 rows** → **Card PAN + NRIC · blocked**. |
| Control → **CUEs** → the Payments row marked *draft · not published* | Draft v4 by Arjun Menon adds **dlp-mask-query-results**. Inherited rows say *inherited from Bank baseline* and are locked. |
| Discover → **AI services** → **DeepSeek** | Prohibited · 6 endpoints (Treasury). |
| Discover → AI services → **Perplexity** → set **Under review** | Saved. Everyone's governed count becomes **24 of 27**. |
| Control → **MCP Bridge** → confluence → **Approve** | **Refused.** Toast: *Only Tan Wei Ling (Admin) or Priscilla Goh (CISO) can approve or block MCP servers. Arjun Menon (Security) can triage and recommend.* confluence stays *Awaiting approval*. |

### Beat 4: the developer asks (window B, `rahul`)

```text
claude "open the runbook for settlement retries"
```

**Expect** (not yet allowed):

```text
BLOCKED — MCP server "confluence" is not allowed for Engineering — Payments
```

```text
aegis mcp request confluence --reason "read runbooks while debugging settlement"
```

**Expect:**

```text
     scan:   scanning… ✓ passed · read-only (search, get_page) · risk low
     status: awaiting decision — Tan Wei Ling (Admin) or Priscilla Goh (CISO)
```

- Window A (CISO) toast: *Rahul Iyer is asking for the confluence MCP server — waiting on your decision*. Window C (Security) is told who decides.
- `/me` → *My MCP requests*: **confluence · awaiting decision**.

### Beat 5: the CISO decides (window A, `priscilla`)
**Do:** in the bottom-right bar click **Approve confluence MCP**, then **Publish Payments CUE v4**.
(Or: Control → MCP Bridge → confluence → Approve; Control → CUEs → Payments draft → publish.)

**Expect:**
- Toasts: *confluence approved by Priscilla Goh for Engineering — Payments*, then *Payments CUE v4 published by Priscilla Goh · signed and pushed*.
- MCP Bridge: confluence **Onboarded**; *Access by group* shows **Allowed** for Engineering — Payments.
- CUEs: `claude-code/payments-eng@v4`, and the draft row is gone.
- Home: *Decisions awaiting you* drops (confluence and CUE v4 disappear from the list).
- Rahul's terminal (window B) announces:

```text
aegis ▸ confluence approved by Priscilla Goh for Engineering — Payments — the MCP is now available through the Aegis Bridge (Priscilla Goh)
aegis ▸ signed CUE claude-code/payments-eng@v4 pushed — adds dlp-mask-query-results (query results are masked before they reach the model) (Priscilla Goh)
```

### Beat 6: the developer is unblocked (window B, `rahul`)

```text
claude "open the runbook for settlement retries"
```

**Expect:**

```text
claude via MCP confluence (approved · Engineering — Payments)
  confluence.get_page "Runbook — card settlement retries (PAY-RB-014)"
✓ MCP call stayed inside the Aegis Bridge sandbox.
```

```text
claude "summarise today's settlement exceptions"
```

**Expect:**

```text
  aegis ▸ dlp-mask-query-results masked 2 columns before the result reached the model
         pan → 4539 •••• •••• 1187   nric → S•••••••D
✓ 3 settlement exceptions today: 2 duplicate FAST reversals, 1 late SWIFT MT103 confirmation.
No detection — nothing sensitive left the sandbox.
```

The detection count does **not** go up.

### Beat 7: the admin closes the loop (`weiling`)
**Do:** sign out (bottom left, under the name), sign in as `weiling`, open **Home**, then Protect → **Fleet**.

**Expect:**
- **Endpoints on an older CUE: 17** (Payments 6 · Digital Banking 9 · Data 2). The attention row says Payments current is **v4**, so those 6 are still catching up.
- **Discovery sensors silent: 1**: *sase_zscaler (remote staff) has sent no data for 2 h 40 m*.
- **Groups due for recertification: 1**: Vendor Engineering (contractors), in 14 days.
- **Agents enforcing 371 / 412** · Agents offline **9**.
- Finish with **Reset demo** → confirm. Every open window reloads to the seed.

---

## 3. Terminal simulation reference

Sign in as `rahul` and open **/terminal**. Hosts: `LT-SG-2231` (MacBook) and `vm-dev-rahul-07` (dev VM; pick it in the drop-down at the top).
Each host needs its own `aegis run …` first.

| Command | When it succeeds | When it's refused or different |
|---|---|---|
| `demo` | Lists the five scripted commands | — |
| `help` | Short help | — |
| `whoami` | `rahul.iyer — Rahul Iyer — Engineering — Payments — spiffe://straitsmeridian.example/user/rahul.iyer` | — |
| `clear` | Clears the screen | — |
| `aegis run claude-code --src ./settlement-recon --writable` | Boots under `payments-eng@v3` (v4 after publish, adding `dlp-mask-query-results` and `confluence`) | — |
| `claude "find why yesterday's card settlement is off by SGD 1,240"` | **After v4:** masked result, *Found it: batch B-0927-04…*, no detection | **Before v4:** **BLOCKED** (card PAN + NRIC), new critical detection. **Before `aegis run`:** *No sandbox yet.* |
| `claude "summarise today's settlement exceptions"` | **After v4:** masked, *3 settlement exceptions today…*, no detection | **Before v4:** **BLOCKED** (86 rows with PAN + NRIC), new critical detection |
| `aegis mcp request confluence --reason "…"` | *awaiting decision* and a live toast to Admin/CISO | **Already approved:** *confluence is already approved…* **Blocked:** *confluence was blocked by <name>. Reason: …* |
| `claude "open the runbook for settlement retries"` | **After approval:** runbook PAY-RB-014 | **Before approval, or if blocked:** **BLOCKED — MCP server "confluence" is not allowed…**. **Before `aegis run`:** *No sandbox yet.* |
| anything else (e.g. `ls -la`) | — | *ls -la: not one of the scripted commands. Type demo.* |

**Who can use the terminal**

| Persona | Terminal |
|---|---|
| `rahul` | Types on his two hosts |
| `weiling` | Can open and type on Rahul's hosts |
| `arjun` | **Read-only replay.** Sees what Rahul ran since the last reset and live updates, but cannot type |
| `priscilla` | **None.** `/terminal` sends her back to the console |

### Simulating from a shell (optional, no browser)

Run these from any terminal while the server is running. First sign in and keep the session cookie:

```bash
curl -s -c rahul.txt -H 'content-type: application/json' -d '{"username":"rahul","password":"demo"}' http://localhost:3000/api/login
```

Then send terminal commands (output comes back as JSON; the consoles update live):

```bash
curl -s -b rahul.txt -H 'content-type: application/json' -d '{"host":"LT-SG-2231","cmd":"aegis run claude-code --src ./settlement-recon --writable"}' http://localhost:3000/api/terminal/exec
```

```bash
curl -s -b rahul.txt -H 'content-type: application/json' -d "{\"host\":\"LT-SG-2231\",\"cmd\":\"claude \\\"find why yesterday's card settlement is off by SGD 1,240\\\"\"}" http://localhost:3000/api/terminal/exec
```

Sign in other personas the same way (`weiling.txt`, `arjun.txt`, `priscilla.txt`) to drive their actions. For example, the CISO approving confluence:

```bash
curl -s -c priscilla.txt -H 'content-type: application/json' -d '{"username":"priscilla","password":"demo"}' http://localhost:3000/api/login
```

```bash
curl -s -b priscilla.txt -X PATCH -H 'content-type: application/json' -d '{"status":"approved","group_id":"grp_payments_eng"}' http://localhost:3000/api/control/mcp-bridge/mcp_confluence
```

```bash
curl -s -b priscilla.txt -X POST http://localhost:3000/api/control/cues/cue_payments_v3/publish
```

---

## 4. Positive test cases (should succeed)

Run on a freshly reset demo, in order.

| ID | As | Steps | Expected result |
|---|---|---|---|
| P1 | any | Sign in at /login by typing the username and `demo` (the page lists no accounts) | Lands on the console (`weiling`, `arjun`, `priscilla`) or `/me` (`rahul`) |
| P2 | any | Click **Sign out** (console: bottom-left under your name, or the dark bar; `/me`: bottom-left; terminal: top-right) | Back on the sign-in page; sign in as someone else works |
| P3 | priscilla | Home | 23 of 27 governed · 3.1% · 90% · 17 / 17 · 0 records · 3 decisions (Beat 1) |
| P4 | rahul | Terminal: `aegis run …` | Boots under `payments-eng@v3`, inherited egress + DLP listed |
| P5 | rahul | Terminal: settlement question (before v4) | **BLOCKED**, masked match, *nothing transmitted*; consoles get a critical detection toast; badge 17 → 18 |
| P6 | rahul | `/me` | Access (group, CUE v3 + pending draft v4, tools, models, MCP servers, egress, DLP), spend **USD 18.40 of USD 40.00**, blocked events with why and fix, devices LT-SG-2231 and vm-dev-rahul-07 |
| P7 | arjun | Open det_01JA4K9PAN1 | Escalated, masked evidence, signature, event chain |
| P8 | arjun | Protect → Blast radius → Rahul Iyer | Six-step tree ending in *Card PAN + NRIC · blocked* |
| P9 | arjun | Perplexity → **Under review** | Saved; governed shows 24 of 27 for everyone; survives sign-out |
| P10 | rahul | `aegis mcp request confluence --reason "…"` | *awaiting decision*; CISO/Admin toast; `/me` shows *awaiting decision* |
| P11 | priscilla | **Approve confluence MCP** | confluence Onboarded, allowed for Engineering — Payments; terminal announces it |
| P12 | priscilla | **Publish Payments CUE v4** | `payments-eng@v4` signed; draft gone; terminal announces v4 |
| P13 | rahul | runbook command (after P11) | Runbook PAY-RB-014 shown |
| P14 | rahul | exceptions command (after P12) | Masked result, task succeeds, **no** new detection |
| P15 | weiling | Home after the story | 17 on older CUE (Payments 6 still catching up), zscaler silent, contractor recert in 14 days |
| P16 | weiling | Control → Groups → **New group** → name → **Create group** | Group listed; still there after sign-out/sign-in and after a server restart |
| P17 | weiling | Settings → *Model costs & budgets* → change a cap | Saved; still there after reload |
| P18 | weiling | Protect → Fleet → a device → change its group | Saved; device counts update for everyone |
| P19 | priscilla | Detection det_01JA4K9PAN1 | Opens with evidence **redacted** (rule and target type only). Correct for the CISO (see N12). |
| P20 | weiling | **Reset demo** | All windows reload; numbers back to Beat 1 |

## 5. Negative test cases (must be refused or blocked)

| ID | As | Steps | Expected result |
|---|---|---|---|
| N1 | — | Sign in with a wrong password | *Wrong username or password.* (401); stays on sign-in |
| N2 | — | Open http://localhost:3000/console while signed out | Redirected to /login |
| N3 | rahul | Terminal: runbook command before approval | **BLOCKED — MCP server "confluence" is not allowed for Engineering — Payments** |
| N4 | rahul | Terminal: a `claude …` task before `aegis run` | *No sandbox yet. Run aegis run claude-code … first.* |
| N5 | rahul | Terminal: `ls -la` (or any unscripted command) | *not one of the scripted commands. Type demo.* |
| N6 | rahul | Terminal: exceptions command **before** v4 | **BLOCKED** (86 rows with PAN + NRIC); new critical detection |
| N7 | arjun | MCP Bridge → confluence → **Approve** | Toast: *Only Tan Wei Ling (Admin) or Priscilla Goh (CISO) can approve or block MCP servers…*; status unchanged; server returns 403 |
| N8 | arjun | Groups → select a group → **Deactivate group** | Toast: *Only Tan Wei Ling (Admin) or Priscilla Goh (CISO) can change groups. Your change was not saved.*; the group snaps back to active |
| N9 | arjun | CUEs → Payments draft → publish | Toast: *Only … can publish CUEs.*; nothing published |
| N10 | arjun | Open /terminal and try to type | Read-only replay; typing does nothing (server returns 403 *can view … as a read-only replay but cannot run commands*) |
| N11 | priscilla | Open /terminal | Sent back to the console (no terminal) |
| N12 | priscilla | Open any detection or session | Evidence and prompts redacted (*redacted for your role*) |
| N13 | priscilla | Try to create a group, or retire a CUE; open Settings; look for Reset | Create group / retire → toast *Only Tan Wei Ling (Admin) can …*, nothing changes (API: 403). Settings fields are read-only for her. The demo bar has no **Reset demo** button (API reset → 403). |
| N14 | rahul | Open http://localhost:3000/console | Redirected to `/me` (developers have no console) |
| N15 | rahul | Anything outside his own data (other devices, Control) | 403 (see the API checks below); `/me` only ever shows LT-SG-2231 and vm-dev-rahul-07 |
| N16 | priscilla then rahul | CISO blocks confluence (MCP Bridge → Reject), then Rahul runs `aegis mcp request confluence …` | *confluence was blocked by Priscilla Goh. Reason: …*; runbook stays **BLOCKED** |
| N17 | rahul | `aegis mcp request confluence …` again after approval | *confluence is already approved for Engineering — Payments.* |
| N18 | any | Evidence anywhere | Card numbers and NRICs are always masked (`4539 •••• •••• 1187`, `S•••••••D`); never a full number |

### API-level negative checks (curl)

Sign in first as shown in *Simulating from a shell*. Every refusal uses the API error shape `{ "error", "code", "request_id" }`.

| Call | As | Expected |
|---|---|---|
| `POST /api/login` with a wrong password | — | **401** `UNAUTHENTICATED` *Wrong username or password.* |
| `GET /api/control/cues` with no cookie | — | **401** `UNAUTHENTICATED` *Not signed in.* |
| `GET /api/control/cues` | rahul | **403** `FORBIDDEN` *Role 'developer' (Rahul Iyer) cannot call listCues.* |
| `GET /api/devices/<Jia Hui Ong's device id>` | rahul | **403** *…cannot call getDevice.* |
| `PATCH /api/control/mcp-bridge/mcp_confluence` `{"status":"approved"}` | arjun | **403** *Role 'security' (Arjun Menon) cannot call decideBridgeMcp.* |
| `POST /api/control/cues/cue_payments_v3/publish` | arjun | **403** *…cannot call publishCue.* |
| `DELETE /api/control/cues/cue_bank_baseline` | priscilla | **403** *Role 'ciso' (Priscilla Goh) cannot call deleteCue.* |
| `POST /api/demo/reset` | priscilla | **403** *…cannot call resetDemo.* |
| `POST /api/control/groups` `{"name":"x"}` | priscilla | **403** *…cannot call createGroup.* |
| `PUT /api/discovery/services/perplexity/status` `{"status":"unlabelled"}` | arjun | **400** `INVALID_PARAMETER` *status must be approved \| unapproved \| prohibited \| under_review \| beta.* |
| `DELETE /api/control/cues/cue_soc_v1` | weiling | **400** *CUE is assigned to Cyber Defence (SOC); assign another CUE first.* |
| `POST /api/terminal/exec` | arjun | **403** *Arjun Menon can view LT-SG-2231 as a read-only replay but cannot run commands.* |
| `GET /api/terminal/hello?host=LT-SG-2231` | priscilla | **403** *Priscilla Goh has no terminal access to LT-SG-2231.* |
| `GET /api/detections/det_01JA4K9PAN1` | priscilla | **200**, but `evidence` has every key `null` except `"type": "sensitive_content"` |

Example (Security trying to approve):

```bash
curl -s -c arjun.txt -H 'content-type: application/json' -d '{"username":"arjun","password":"demo"}' http://localhost:3000/api/login
```

```bash
curl -s -b arjun.txt -X PATCH -H 'content-type: application/json' -d '{"status":"approved"}' http://localhost:3000/api/control/mcp-bridge/mcp_confluence
```

Expected: `{"error":"Role 'security' (Arjun Menon) cannot call decideBridgeMcp.","code":"FORBIDDEN","request_id":"req_…"}`

---

## 6. Automated checks

With the bank server running (`npm run start:bank`) in another terminal:

| Command | What it checks | Expected last line |
|---|---|---|
| `npm run validate:tenant` | JSON, API schemas, every number reconciles, ids exist, no unmasked PAN/NRIC (server not needed) | `ALL PASSED (35 passed, 4 notes)` |
| `BASE=http://localhost:3000 npm run check:access` | Every API route × every persona against `access-matrix.json` | `ALL ROUTES MATCH THE ACCESS MATRIX` |
| `BASE=http://localhost:3000 npm run check:storyline` | The 7 beats end to end (positive and negative) | `STORYLINE OK (27 checks passed)` |
| `BASE=http://localhost:3000 npm run check:persistence:write`, restart the server, then `…:verify` | Changes survive sign-out and restart; Security's edit refused | `PERSISTENCE WRITE OK` / `PERSISTENCE VERIFY OK` |
| `BASE=http://localhost:3000 npm run shots:bank` | Screenshots to `design/bank-shot-*.png` (uses installed Google Chrome) | `no page errors` |

The access, storyline and persistence checks reset the demo themselves. Run them when nobody is presenting.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Numbers don't match Beat 1 | Someone changed things earlier. Sign in as `weiling` → **Reset demo** |
| A command says *No sandbox yet* | Run `aegis run claude-code --src ./settlement-recon --writable` on that host first |
| Signing in on one tab signs out another | One sign-in per browser. Use a second browser or a private window |
| The console looks empty or out of date | Reload the page. It replays the saved state |
| Start completely fresh | Stop the server, delete `data/tenants/straits-meridian/live-state.json`, start again |
| Port 3000 is busy | `PORT=3001 npm run start:bank`, then use http://localhost:3001 |
