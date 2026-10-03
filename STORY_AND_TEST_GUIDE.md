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
- **Decisions:** Decisions awaiting you **2** · Frameworks tracked **4** · MCP servers onboarded **4**.
- Sidebar: **Inbox 1** (Rahul's confluence request, waiting 3 h).
- Banner: **7** DLP-blocked agent runs in the last 7 days.
- *Needs attention*: two **DECISION** rows (Rahul's confluence request, unlabelled services) and four **FRAMEWORK** rows. The frameworks are named only, "mapping to be confirmed". The Payments CUE v4 draft is not here yet: Arjun hasn't sent it for approval (Beat 3).

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
| On the draft: **Edit** → **Continue** → **Continue** → **Publish and sign** | Arjun can't publish, so the **Inbox** panel opens: *Request approval · Publish Payments CUE v4*, the change (+ DLP dlp-mask-query-results · Enforce), and who approves. Add a reason → **Send for approval**. Toast: *Sent for approval · Tan Wei Ling and Priscilla Goh notified*. |
| Window A (CISO) at the same moment | Toast *📥 Arjun Menon asks you to publish Payments CUE v4 · Open*; **Inbox 2**; *Decisions awaiting you* **3**. |
| Discover → **AI services** → **DeepSeek** | Prohibited · 6 endpoints (Treasury). |
| Discover → AI services → **Perplexity** → set **Under review** | Saved. Everyone's governed count becomes **24 of 27**. |
| Control → **MCP Bridge** → confluence → **Approve** | Not approved. The panel offers **Recommend approve**. Add a note → **Send recommendation**. It is attached to Rahul's request; the CISO and Admin see *Arjun Menon recommends you approve confluence*. confluence stays *Awaiting approval*. |

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
     request wf_confluence (opened 3 h ago from /me) — your terminal request is attached
     scan:   scanning… ✓ passed · read-only (search, get_page) · risk low
     status: awaiting decision — Tan Wei Ling (Admin) or Priscilla Goh (CISO)
     inbox:  ✓ Tan Wei Ling and Priscilla Goh notified · Arjun Menon recommends approval
```

- Confluence was already requested from `/me` 3 hours earlier, so the terminal **attaches** to that request instead of opening a second one. The CISO and Admin get *📥 Rahul Iyer asked again: confluence MCP server for Engineering — Payments*.
- `/me` → *My MCP requests*: **confluence · awaiting decision**; *Inbox*: the request, waiting for Tan Wei Ling or Priscilla Goh.

### Beat 5: the CISO decides (window A, `priscilla`)
**Do:** open **Inbox** (sidebar, under Home).
1. **Publish Payments CUE v4** (from Arjun): read *What changes if approved* → **Approve and publish**. (Or **Send back** with a note: Arjun sees *Sent back* and can **Resubmit**.)
2. **confluence MCP server for Engineering — Payments** (from Rahul, with Arjun's recommendation): **Access lasts** → pick a duration (default **30 days**; **2 minutes (demo)** shows expiry live) → **Approve**.

(Shortcut: the bottom-right bar's **Approve confluence MCP · 30 days** and **Publish Payments CUE v4** do the same and close the open requests.)

**Expect:**
- Toasts: *confluence approved by Priscilla Goh for Engineering — Payments*, then *Payments CUE v4 published by Priscilla Goh · signed and pushed*.
- Arjun's inbox: *Priscilla Goh approved: Publish Payments CUE v4*. Rahul's inbox and `/me`: *approved for 30 days*; *MCP servers* shows **confluence · expires in 30 days**.
- The request history reads *Arjun Menon requested → Priscilla Goh approved* (maker and checker).
- MCP Bridge: confluence **Onboarded**, *Groups with access* **Engineering — Payments (30d left)**; *Access by group* shows **Allowed · 30d**.
- CUEs: `claude-code/payments-eng@v4`, and the draft row is gone.
- Home: *Decisions awaiting you* drops (confluence and CUE v4 disappear from the list).
- Rahul's terminal (window B) announces:

```text
aegis ▸ confluence approved by Priscilla Goh for Engineering — Payments for 30 days — the MCP is now available through the Aegis Bridge (Priscilla Goh)
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

### Beat 8 (optional): short-lived access, suspend and deboard
| Do | Expect |
|---|---|
| As `priscilla` or `weiling`: approve confluence with **2 minutes (demo)** | Bridge shows *(2m left)*. After 2 minutes the server removes it from Engineering — Payments. Everyone is told *confluence access for Engineering — Payments expired*. Rahul's terminal prints *confluence access … expired — run: aegis mcp request confluence … to renew*. |
| Rahul: `aegis mcp request confluence --reason "renew"` | *requesting renewed access* → a new request in the approvers' inbox (Decline leaves the server as it is) |
| CISO: MCP Bridge → an onboarded server → **Suspend** → reason → **Suspend** | Status **Suspended** for every group at once, no second approver. **Reinstate** restores the groups it had. |
| CISO: **Deboard** | Removed from the MCP Bridge and from every group, at once |
| Arjun: **Suspend** or **Deboard** | Opens *Request approval* instead. Admin or CISO approves suspend; deboard goes to Admin or CISO (both hold it). |

---

## 3. Approvals and the inbox

When someone's role can't make a change, the console doesn't just refuse: it offers **Send for approval**. The request waits in the approvers' **Inbox** (sidebar under Home, and the **Inbox** button in the bottom-right bar). On approval, the server runs the same change the approver could have made directly, **as the approver**. Roles are still enforced on the server.

**Rules**
- **Admin and CISO act directly** on anything their role allows, including their own drafts. No second approver.
- **Reducing access never waits.** Suspend, deboard, removing a group's access and blocking are immediate for Admin and CISO.
- **Granting MCP access is time-limited by default.** Choose 2 minutes (demo), 1 hour, 8 hours, 24 hours, 7 days, **30 days** (default), 90 days or no expiry. The server removes expired grants and tells the requester and the approvers.
- **One open request per subject.** Asking again (for example from the terminal) attaches to the open request.
- **Nobody decides their own request.** A request is refused if the console area changed after it was sent; the requester is told to make the change again.

**Flows that go through approval**

| Flow | Who asks | Who approves | On approval |
|---|---|---|---|
| MCP access for a group (and renewal after expiry) | Developer (`/me` form or `aegis mcp request`) | Admin, CISO | Server onboarded + allowed for the group, for the chosen duration |
| MCP decision + recommendation | Security (Approve or Reject on the Bridge becomes a recommendation) | Admin, CISO | Approve or block |
| Onboard an MCP server | Security | Admin, CISO | Added to the Bridge and scanned |
| Suspend an MCP server | Security | Admin, CISO | Blocked everywhere; Reinstate restores |
| Deboard an MCP server | Security | Admin, CISO | Removed from the Bridge and every group |
| Publish a CUE (maker–checker) | Security (drafts) | Admin, CISO | Signed and pushed |
| Group MCP access, group edits, device groups | Security | Admin, CISO | Policy applied (granting access asks for a duration) |
| Create a group, retire a CUE, settings (rates, budgets) | Security, CISO | Admin | Change applied |
| Daily budget exception | Developer (`/me` → *Ask for a higher cap*) | Admin | Cap raised for 24 h, that developer only |

Governance status (Approved, Under review…) needs no approval: Admin, CISO and Security can all set it.

---

## 4. Terminal simulation reference

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
| `aegis mcp request confluence --reason "…"` | *awaiting decision*; attaches to the open request; inbox notice to Admin and CISO | **Already approved:** *confluence is already approved… (expires in …)*. **Expired:** asks for renewed access. **Blocked:** *confluence was blocked by <name>…* **Suspended:** *confluence is suspended by <name>…* |
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

Approvals from a shell. Arjun asks, Priscilla reads her inbox and approves (use the `id` the first call returns):

```bash
curl -s -c arjun.txt -H 'content-type: application/json' -d '{"username":"arjun","password":"demo"}' http://localhost:3000/api/login
```

```bash
curl -s -b arjun.txt -H 'content-type: application/json' -d '{"kind":"cue_publish","cue_id":"cue_payments_v3","reason":"mask query results"}' http://localhost:3000/api/workflows
```

```bash
curl -s -b priscilla.txt http://localhost:3000/api/inbox
```

```bash
curl -s -b priscilla.txt -H 'content-type: application/json' -d '{"decision":"approve"}' http://localhost:3000/api/workflows/<id>/decision
```

Approve Rahul's seeded confluence request for 2 minutes, to watch it expire:

```bash
curl -s -b priscilla.txt -H 'content-type: application/json' -d '{"decision":"approve","access_ttl_minutes":2}' http://localhost:3000/api/workflows/wf_confluence/decision
```

---

## 5. Positive test cases (should succeed)

Run on a freshly reset demo, in order.

| ID | As | Steps | Expected result |
|---|---|---|---|
| P1 | any | Sign in at /login by typing the username and `demo` (the page lists no accounts) | Lands on the console (`weiling`, `arjun`, `priscilla`) or `/me` (`rahul`) |
| P2 | any | Click **Sign out** (console: bottom-left under your name, or the dark bar; `/me`: bottom-left; terminal: top-right) | Back on the sign-in page; sign in as someone else works |
| P3 | priscilla | Home | 23 of 27 governed · 3.1% · 90% · 17 / 17 · 0 records · 2 decisions · Inbox 1 (Beat 1) |
| P4 | rahul | Terminal: `aegis run …` | Boots under `payments-eng@v3`, inherited egress + DLP listed |
| P5 | rahul | Terminal: settlement question (before v4) | **BLOCKED**, masked match, *nothing transmitted*; consoles get a critical detection toast; badge 17 → 18 |
| P6 | rahul | `/me` | Access (group, CUE v3 + pending draft v4, tools, models, MCP servers, egress, DLP), spend **USD 18.40 of USD 40.00**, blocked events with why and fix, devices LT-SG-2231 and vm-dev-rahul-07 |
| P7 | arjun | Open det_01JA4K9PAN1 | Escalated, masked evidence, signature, event chain |
| P8 | arjun | Protect → Blast radius → Rahul Iyer | Six-step tree ending in *Card PAN + NRIC · blocked* |
| P9 | arjun | Perplexity → **Under review** | Saved; governed shows 24 of 27 for everyone; survives sign-out |
| P10 | rahul | `aegis mcp request confluence --reason "…"` | *awaiting decision*, attached to `wf_confluence`; CISO/Admin inbox notice; `/me` shows *awaiting decision* |
| P11 | priscilla | Inbox → confluence → 30 days → **Approve** (or the bar's **Approve confluence MCP · 30 days**) | confluence Onboarded, allowed for Engineering — Payments for 30 days; terminal announces it; Rahul's inbox says approved |
| P12 | priscilla | **Publish Payments CUE v4** | `payments-eng@v4` signed; draft gone; terminal announces v4 |
| P13 | rahul | runbook command (after P11) | Runbook PAY-RB-014 shown |
| P14 | rahul | exceptions command (after P12) | Masked result, task succeeds, **no** new detection |
| P15 | weiling | Home after the story | 17 on older CUE (Payments 6 still catching up), zscaler silent, contractor recert in 14 days |
| P16 | weiling | Control → Groups → **New group** → name → **Create group** | Group listed; still there after sign-out/sign-in and after a server restart |
| P17 | weiling | Settings → *Model costs & budgets* → change a cap | Saved; still there after reload |
| P18 | weiling | Protect → Fleet → a device → change its group | Saved; device counts update for everyone |
| P19 | priscilla | Detection det_01JA4K9PAN1 | Opens with evidence **redacted** (rule and target type only). Correct for the CISO (see N12). |
| P20 | weiling | **Reset demo** | All windows reload; numbers back to Beat 1 |
| P21 | arjun | CUE draft → Edit → Continue ×2 → **Publish and sign** → reason → **Send for approval** | Request *Publish Payments CUE v4* waiting; CISO and Admin get a live notice; CISO *Decisions awaiting you* 2 → 3 |
| P22 | priscilla | Inbox → *Publish Payments CUE v4* → **Send back** with a note | Arjun sees *Sent back* with the note; **Resubmit** puts it back in her inbox |
| P23 | priscilla | Inbox → the resubmitted request → **Approve and publish** | v4 published; history *requested → sent back → resubmitted → approved* |
| P24 | arjun | MCP Bridge → confluence → **Approve** → **Send recommendation** | Recommendation shown on Rahul's request and in the terminal output |
| P25 | priscilla | Approve confluence with **2 minutes (demo)**, wait 2 minutes | Expires: removed from Engineering — Payments; Rahul, Arjun (recommender) and approvers notified; terminal shows the expiry |
| P26 | rahul | After P25: `aegis mcp request confluence --reason "renew"` | *requesting renewed access*; new request in the inbox; approve again |
| P27 | priscilla | MCP Bridge → jira → **Suspend** → **Suspend**, then **Reinstate** | *Suspended* everywhere at once; Reinstate → *Onboarded* with the same groups |
| P28 | priscilla | MCP Bridge → an onboarded server → **Deboard** | Removed from the Bridge and every group |
| P29 | rahul | `/me` → *Ask for a higher cap* (USD 60) → Admin approves in her inbox | *My spend* shows USD 60, *raised from USD 40 by Tan Wei Ling · expires in 24 h* |
| P30 | arjun | Groups → **Deactivate group** → **Send for approval**; Admin approves | The group is deactivated for everyone after approval |
| P31 | any | Restart the server with requests open | Inbox, notices and grants are all still there (saved in `live-state.json`) |

## 6. Negative test cases (must be refused or blocked)

| ID | As | Steps | Expected result |
|---|---|---|---|
| N1 | — | Sign in with a wrong password | *Wrong username or password.* (401); stays on sign-in |
| N2 | — | Open http://localhost:3000/console while signed out | Redirected to /login |
| N3 | rahul | Terminal: runbook command before approval | **BLOCKED — MCP server "confluence" is not allowed for Engineering — Payments** |
| N4 | rahul | Terminal: a `claude …` task before `aegis run` | *No sandbox yet. Run aegis run claude-code … first.* |
| N5 | rahul | Terminal: `ls -la` (or any unscripted command) | *not one of the scripted commands. Type demo.* |
| N6 | rahul | Terminal: exceptions command **before** v4 | **BLOCKED** (86 rows with PAN + NRIC); new critical detection |
| N7 | arjun | MCP Bridge → confluence → **Approve** | Not approved: offers **Recommend approve** instead; status unchanged. A direct API call returns 403 |
| N8 | arjun | Groups → select a group → **Deactivate group** | Server refuses; the group snaps back to active; the *Request approval* panel offers to send it to Tan Wei Ling or Priscilla Goh (**Discard** leaves nothing behind) |
| N9 | arjun | CUEs → Payments draft → publish | Nothing published; *Request approval* opens instead (P21) |
| N10 | arjun | Open /terminal and try to type | Read-only replay; typing does nothing (server returns 403 *can view … as a read-only replay but cannot run commands*) |
| N11 | priscilla | Open /terminal | Sent back to the console (no terminal) |
| N12 | priscilla | Open any detection or session | Evidence and prompts redacted (*redacted for your role*) |
| N13 | priscilla | Try to create a group, or retire a CUE; open Settings; look for Reset | Create group / retire → refused and rolled back; *Request approval* sends it to Tan Wei Ling (Admin) only (API: 403). Settings fields are read-only for her. The demo bar has no **Reset demo** button (API reset → 403). |
| N14 | rahul | Open http://localhost:3000/console | Redirected to `/me` (developers have no console) |
| N15 | rahul | Anything outside his own data (other devices, Control) | 403 (see the API checks below); `/me` only ever shows LT-SG-2231 and vm-dev-rahul-07 |
| N16 | priscilla then rahul | CISO blocks confluence (MCP Bridge → Reject), then Rahul runs `aegis mcp request confluence …` | *confluence was blocked by Priscilla Goh. Reason: …*; runbook stays **BLOCKED** |
| N17 | rahul | `aegis mcp request confluence …` again after approval | *confluence is already approved for Engineering — Payments.* |
| N18 | any | Evidence anywhere | Card numbers and NRICs are always masked (`4539 •••• •••• 1187`, `S•••••••D`); never a full number |
| N19 | arjun | Open a request in the inbox | No Approve button: he can only recommend (MCP) or withdraw his own |
| N20 | priscilla | Approve her own *create group* request | Not offered; API → 403 *You cannot decide your own request.* |
| N21 | priscilla | Approve Rahul's budget exception | Not in her inbox (settings are Admin only); API → 403 |
| N22 | priscilla | **Send back** without a note | *Say what should change before sending it back.* (API 400) |
| N23 | weiling | `POST /api/workflows` (ask for approval) | 403: Admin holds every permission, so never needs to ask |
| N24 | arjun | Approve a request that is already decided | 409 *This request is already approved by …* |
| N25 | rahul | After the grant expired: runbook command | **BLOCKED** again until renewed |
| N26 | rahul | `aegis mcp request confluence` while it's **suspended** | *confluence is suspended by <name> for every group.* |

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
| `POST /api/workflows/<id>/decision` `{"decision":"approve"}` | arjun | **403** *…cannot call decideWorkflow.* |
| `POST /api/workflows/<id>/decision` `{"decision":"approve"}` on Rahul's budget request | priscilla | **403** *Only Tan Wei Ling (Admin) can decide this.* |
| `POST /api/workflows/<id>/decision` `{"decision":"return"}` | priscilla | **400** *Say what should change when you send a request back.* |
| `PATCH /api/control/mcp-bridge/mcp_jira` `{"status":"blocked","suspend":true}` | arjun | **403** *…cannot call decideBridgeMcp.* |
| `POST /api/workflows` `{"kind":"budget_exception","cap_usd":500}` | rahul | **400** *cap_usd must be above USD 40 and at most USD 200.* |

Example (Security trying to approve):

```bash
curl -s -c arjun.txt -H 'content-type: application/json' -d '{"username":"arjun","password":"demo"}' http://localhost:3000/api/login
```

```bash
curl -s -b arjun.txt -X PATCH -H 'content-type: application/json' -d '{"status":"approved"}' http://localhost:3000/api/control/mcp-bridge/mcp_confluence
```

Expected: `{"error":"Role 'security' (Arjun Menon) cannot call decideBridgeMcp.","code":"FORBIDDEN","request_id":"req_…"}`

---

## 7. Automated checks

With the bank server running (`npm run start:bank`) in another terminal:

| Command | What it checks | Expected last line |
|---|---|---|
| `npm run validate:tenant` | JSON, API schemas, every number reconciles, ids exist, no unmasked PAN/NRIC (server not needed) | `ALL PASSED (35 passed, 4 notes)` |
| `BASE=http://localhost:3000 npm run check:access` | Every API route (74, including the inbox and approvals) × every persona against `access-matrix.json` | `ALL ROUTES MATCH THE ACCESS MATRIX` |
| `BASE=http://localhost:3000 npm run check:storyline` | The 7 beats end to end, plus approvals, send back, recommendations, a 4-second grant that expires, suspend, deboard and a budget exception | `STORYLINE OK (49 checks passed)` |
| `BASE=http://localhost:3000 npm run check:persistence:write`, restart the server, then `…:verify` | Changes survive sign-out and restart; Security's edit refused | `PERSISTENCE WRITE OK` / `PERSISTENCE VERIFY OK` |
| `BASE=http://localhost:3000 npm run shots:bank` | Screenshots to `design/bank-shot-*.png` (uses installed Google Chrome) | `no page errors` |

The access, storyline and persistence checks reset the demo themselves. Run them when nobody is presenting.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Numbers don't match Beat 1 | Someone changed things earlier. Sign in as `weiling` → **Reset demo** |
| A command says *No sandbox yet* | Run `aegis run claude-code --src ./settlement-recon --writable` on that host first |
| Signing in on one tab signs out another | One sign-in per browser. Use a second browser or a private window |
| The console looks empty or out of date | Reload the page. It replays the saved state |
| Start completely fresh | Stop the server, delete `data/tenants/straits-meridian/live-state.json`, start again |
| Port 3000 is busy | `PORT=3001 npm run start:bank`, then use http://localhost:3001 |
