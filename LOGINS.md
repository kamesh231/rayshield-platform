# Demo logins and what each role can do

Every account uses the password **`demo`**. The sign-in page does not list accounts or passwords; this file is the reference.
Keep this page open while you demo, so you know who to sign in as for each step.
The step-by-step story, terminal commands and test cases are in [STORY_AND_TEST_GUIDE.md](STORY_AND_TEST_GUIDE.md).

---

## Signing in and out

| | How |
|---|---|
| **Sign in** | Go to **http://localhost:3000/login**, type the username and `demo`, then **Sign in**. |
| **Sign out: console** | **Sign out** under your name at the **bottom left** of the sidebar (also in the dark bar at the bottom right). |
| **Sign out: My access page (`/me`)** | **Sign out** under your name in the left sidebar. |
| **Sign out: terminal** | **Sign out** at the top right. |
| **Two people at once** | A browser holds one sign-in at a time. For a second persona, use another browser or a private window. |

Signing out never loses work: every change is saved on the server (see [Where changes are saved](#where-changes-are-saved)).

---

## Straits Meridian Bank (fictional) — `DEMO_TENANT=straits-meridian`

Start it with `npm run start:bank` (or `DEMO_TENANT=straits-meridian npm start`), then open http://localhost:3000.

| Username | Password | Person | Title | Role | Lands on |
|---|---|---|---|---|---|
| `weiling` | `demo` | Tan Wei Ling | Platform Administrator, Technology Risk | **Admin** | Console · Admin home |
| `arjun` | `demo` | Arjun Menon | SOC Lead, Cyber Defence | **Security** | Console · Security home |
| `priscilla` | `demo` | Priscilla Goh | Chief Information Security Officer | **CISO** | Console · exec home |
| `rahul` | `demo` | Rahul Iyer | Senior Engineer, Payments | **Developer** | My access (`/me`) + Terminal |

### Admin: `weiling` (Tan Wei Ling)
*Keeps coverage complete and policy current.*
- **Can:** everything:
  - approve or block MCP servers, and onboard or remove them;
  - create, edit, publish, retire and delete CUEs;
  - create and edit groups, and change group MCP policy and device groups;
  - set governance status;
  - change Settings (budgets, rates, directory, sensors);
  - **Reset demo**.
- **Demo bar:** Approve confluence MCP · Publish Payments CUE v4 · Reset demo · Sign out.
- **Terminal:** can open Rahul's hosts.

### Security: `arjun` (Arjun Menon)
*Sees what needs attention, triages it, proves nothing was tampered with.*
- **Can:** read everything, with full evidence. Can set governance status (e.g. label Perplexity *Under review*), review the Payments CUE v4 draft, and triage detections and blast radius.
- **Cannot:** approve or block MCP servers (he recommends; Admin or CISO decides), onboard MCP servers, publish or delete CUEs, create or edit groups, change settings, or reset. The console refuses with a message naming who can, and the server returns `403`.
- **Terminal:** read-only replay of Rahul's hosts. He can watch but not type.

### CISO: `priscilla` (Priscilla Goh)
*A defensible posture for the board and MAS, and the high-risk calls.*
- **Can:** read everything, with **evidence redacted** (rule and target type only; prompts hidden). Can approve or block MCP servers, onboard MCP servers, create, edit and publish CUEs, change group MCP policy and device groups, and set governance status.
- **Cannot:** reset the demo, delete CUEs, remove MCP servers, create groups, or change settings. There's no terminal.
- **Demo bar:** Approve confluence MCP · Publish Payments CUE v4 · Sign out.

### Developer: `rahul` (Rahul Iyer)
*Keeps using Claude Code, knows what's allowed, gets unblocked fast.*
- **Can:** see only his own two devices (`LT-SG-2231`, `vm-dev-rahul-07`), sessions and blocked events, each with *why* and *how to fix*. Sees his access (tools, models, MCP servers, egress, CUE) and spend against the USD 40/day cap. Can request MCP servers from `/me` or the terminal, and run the scripted terminal on his own hosts (type `demo`).
- **Cannot:** open the console, or read Control (groups, CUEs, MCP Bridge) or anyone else's data. Every such call returns `403`.

### Who can do what (quick reference)

| Action | Admin `weiling` | Security `arjun` | CISO `priscilla` | Developer `rahul` |
|---|:-:|:-:|:-:|:-:|
| Read Discover / Protect / Usage | ✓ | ✓ | ✓ (evidence redacted) | own data only |
| Set governance status | ✓ | ✓ | ✓ | ✗ |
| Approve / block MCP server | ✓ | ✗ | ✓ | ✗ (requests one) |
| Onboard MCP server | ✓ | ✗ | ✓ | ✗ |
| Remove MCP server | ✓ | ✗ | ✗ | ✗ |
| Create / edit / publish CUE | ✓ | ✗ (reads, reviews drafts) | ✓ | ✗ |
| Retire / delete CUE | ✓ | ✗ | ✗ | ✗ |
| Group MCP policy, device groups, edit group | ✓ | ✗ | ✓ | ✗ |
| Create group | ✓ | ✗ | ✗ | ✗ |
| Settings (budgets, rates, directory, sensors) | ✓ | read | read | ✗ |
| Reset demo | ✓ | ✗ | ✗ | ✗ |
| Terminal | Rahul's hosts | read-only replay | ✗ | own hosts |

The full per-operation list (67 API operations × 4 personas) is in `data/tenants/straits-meridian/access-matrix.json`.

---

## Where changes are saved

On the bank tenant, every change is saved by the server to **`data/tenants/straits-meridian/live-state.json`**. Changes survive signing out, signing in as someone else, reloading, and restarting the server (it prints `restored demo changes from …` on start).

**What is saved**
- **Console edits:** groups (create, edit, deactivate, recertify, members, attached policies), policies, CUEs (new versions, publish, retire, import), Settings (model rates, budget caps and modes), and devices moved between groups.
- **Server actions:** governance status, MCP approvals, blocks and onboarding, group MCP policy, Payments CUE v4 publish, developer MCP requests, detections raised from the terminal, and terminal history.
- **API writes:** create group, create, edit and delete CUE, assign CUE to group, onboard and remove MCP.

Every save is checked against the signed-in role on the server. If a role isn't allowed, the change is refused, a message says who can do it, and the console puts the old value back.

**Not saved on the server:** the *Arrange* layout of the Discover overview. It's remembered per persona in that browser only.

**Starting over:** sign in as `weiling` → **Reset demo**. That empties `live-state.json` back to the seed. With the server stopped, deleting the file does the same.

Check it yourself (with the bank server running):

```bash
PHASE=write BASE=http://localhost:3000 node scripts/persistence-check.mjs
```

```bash
PHASE=verify BASE=http://localhost:3000 node scripts/persistence-check.mjs
```

Restart the server between the two runs. The write phase makes changes, signs out and back in, and confirms Security's edit is refused. The verify phase confirms the changes are still there after the restart.

---

## Northwind Capital: default tenant (`npm start`)

Unchanged from the original demo. Password `demo` for all. Changes here are kept in memory only and are lost when the server restarts.

| Username | Password | Person | Role | Can |
|---|---|---|---|---|
| `priya` | `demo` | Priya Nair | Tenant Administrator | Full console, approve MCP, reset |
| `tomas` | `demo` | Tomas Weiler | Security Analyst | Full console, approve MCP |
| `ciso` | `demo` | Rhea Menon | CISO | Console, read-only (approve blocked by the server) |
| `dev` | `demo` | Dev Patel | Engineer | Terminal only, no console |
