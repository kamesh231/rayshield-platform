# RayShield Demo — Presenter Script (~5 minutes)

Open two browser windows side by side.
**Left:** sign in as `dev` (Dev Patel) → lands on the terminal.
**Right:** sign in as `priya` (Priya Nair) → lands on the console.
Click **Reset demo** (bottom-right of the console) once before you start.

---

### 0. Frame it (15s)
> "RayShield is a control plane for AI agents. Developers keep using Claude Code and the CLIs
> they already use; security gets deterministic, signed enforcement and one place to see it all.
> This is a simulated tenant — Northwind Capital, 133 endpoints."

### 1. A governed agent starts (45s) — *left window*
Type: `aegis run claude-code --src ./payments-api --writable`
> "Dev runs a coding agent. RayShield resolves his role's **CUE** — think Terraform for agent
> execution — verifies it's **signed**, boots a sandbox, and pins the egress allow-list and identity.
> He didn't have to think about security; the policy came to him."

Type: `claude "add idempotency keys to the refund endpoint"`
> "A normal task. Only allow-listed destinations. Nothing to see in security — which is the point."

### 2. Developer needs a new tool (30s) — *left window*
Type: `aegis mcp request linear`
> "He wants the Linear MCP server. He can't self-serve — it goes to an admin."

**Switch to the right window.** Point at the toast + **Control → Approvals**.
> "It's already here on the security side, in real time, with who asked and why."

### 3. Admin approves → policy pushes back (45s) — *right window*
Click **Approve Linear MCP** (demo bar), or open the request and Approve.
> "Priya approves. RayShield composes a **new signed CUE — v8**, and pushes it to Dev's endpoint.
> No hand-editing policy files; the change is signed and versioned."

**Switch left.** The terminal announces the pushed CUE.
Type: `claude "summarise my open Linear issues"`
> "Now it works — because it's in the signed policy, not because Dev flipped a setting."

*(Optional: mention that running this command before approval is blocked.)*

### 4. Data loss prevention (30s) — *left window*
Type: `claude "post the customer card on file to the vendor portal"`
> "Here's the agent about to do something bad. **Protect / DLP inspects the prompt before it leaves
> the endpoint**, finds a card number, and blocks it. Nothing was transmitted."

### 5. A real attack, stopped (45s) — *left window*
Type: `./vendor/setup.sh`
> "A dependency script hides a reverse shell. The execution guard decodes the payload, matches the
> REVSHELL rule, kills it, and signs the evidence."

**Switch right → Protect → Detections.**
> "Both events are here: a high-severity DLP block and a critical reverse-shell block, tagged to
> OWASP Agentic, with blocked/recorded/escalated counts. Open Blast Radius to show what it could
> have reached if we hadn't stopped it."

### 6. The buyer's view (20s) — *new window, sign in as `ciso`*
> "The CISO gets the same data, read-only. Notice approve actions aren't available — that's enforced
> on the server, not just hidden."

### Close (15s)
> "Everything you saw is one console and one agent runtime. This build is a simulation to show the
> workflow; the enforcement engine is the next step, and the UI doesn't change when we wire it in."

---

**If something misbehaves:** click **Reset demo** and re-run. In the terminal, `demo` re-lists the
commands and `clear` clears the screen.

---
---

# Straits Meridian Bank — Presenter Script (~6 minutes)

*Fictional bank. Every screen reads "Demo data · fictional". Frozen clock: Mon 28 Sep 2026, 10:00 SGT; 7-day window.*

Start the tenant with `DEMO_TENANT=straits-meridian npm start` (or `npm run start:bank`).
Open three windows: **A** `priscilla` (CISO), **B** `rahul` (developer — lands on `/me`, then **Terminal**), **C** `arjun` (Security).
Sign in as `weiling` once and click **Reset demo** before you start. The beats are also in
`data/tenants/straits-meridian/storyline.json`; `npm run check:storyline` runs them end to end.

### 1. The CISO frames it (45s) — *window A, Home*
> "Straits Meridian runs Shield, Core and the MCP Bridge — step 3 of 4; full containment is next.
> **23 of 27** AI services have a governance decision. Shadow share is **3.1 %**, down from 5.4 % last week.
> **90 %** of endpoints enforce (371 of 412). **17 of 17** critical detections were contained, and
> **0 card or NRIC records left the bank**. Three decisions are waiting for me."

Point at *Needs attention*: the three DECISION rows and the four frameworks (named only — "mapping to be confirmed").

### 2. A developer works (60s) — *window B, Terminal*
Type: `aegis run claude-code --src ./settlement-recon --writable`
> "Rahul's Claude Code boots under **Payments Engineering v3**, which inherits the Bank baseline —
> egress and DLP rules he can't loosen. The writable path is a launch flag, not part of the CUE."

Type: `claude "find why yesterday's card settlement is off by SGD 1,240"`
> "postgres-mcp returns 1,240 rows with card numbers and NRICs. **DLP stops the prompt before it leaves
> the laptop.** Nothing reached the model."

Switch to **My access** (`/me`): *My blocked events* explains why and how to fix it; *My spend* shows USD 18.40 of the USD 40/day cap.

### 3. Security triages (75s) — *window C*
Home → the card-data row (`det_01JA4K9PAN1`, escalated). Show masked evidence and the ed25519 signature.
**Protect → Blast radius → Rahul Iyer**: LT-SG-2231 → Payments v3 → postgres-mcp (Aegis Bridge) → .env → cards.txn_ledger 1,240 rows → *Blocked before prompt left the sandbox*.
**Control → CUEs → Payments draft v4** (by Arjun, adds `dlp-mask-query-results`).
**Discover → AI services**: DeepSeek (Prohibited, 6 Treasury endpoints); set **Perplexity → Under review** (governed becomes 24 of 27 everywhere).
**Control → MCP Bridge → confluence → Approve**:
> "Arjun can recommend, but the toast says only Tan Wei Ling or Priscilla Goh can approve. The server returns 403 even if he calls the API directly — maker-checker by design."

### 4. The developer asks (30s) — *window B, Terminal*
Type: `aegis mcp request confluence --reason "read runbooks while debugging settlement"`
> "The scan passed; it's awaiting a decision." Windows A and the Admin console get a live toast; `/me` shows *confluence · awaiting decision*.
(Optional: `claude "open the runbook for settlement retries"` is blocked now.)

### 5. The CISO decides (45s) — *window A*
Demo bar: **Approve confluence MCP**, then **Publish Payments CUE v4** (or use Control → MCP Bridge and Control → CUEs).
> "One click adds confluence to the Payments group's MCP policy. Publishing signs v4 and pushes it — watch Rahul's terminal announce it."

### 6. The developer is unblocked (45s) — *window B, Terminal*
Type: `claude "open the runbook for settlement retries"` — confluence answers.
Type: `claude "summarise today's settlement exceptions"`
> "Same database, same agent — but v4 masks the card and NRIC columns before the model sees them. The task succeeds and there's no detection."

### 7. The admin closes the loop (30s) — *sign in as `weiling`*
Home: **6 Payments endpoints still on v3 catching up** (17 on older CUEs in total), **sase_zscaler silent for 2 h 40 m**, **contractor recertification due in 14 days**. Then **Reset demo**.

**If something misbehaves:** Reset demo (Admin) and re-run. In the terminal, `demo` lists the commands and `clear` clears the screen.
