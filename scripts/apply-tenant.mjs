// Builds the Straits Meridian console (public/console-bank/) from the Claude Design source
// design/console-src/RayShield Console.dc.html. Called by build-console.mjs after the Northwind build.
//
// Data is NOT baked in: every design data constant is patched to read window.__seed (injected per
// signed-in persona by src/server.js from data/tenants/straits-meridian/console-seed.json), falling
// back to the design's own value. Behaviour hooks call window.__demoBridge (public/console-bank/bridge-bank.js)
// so every write goes through the server, which enforces roles.
//
// Every patch must match an exact number of times (once() = 1), so a changed design fails loudly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'design/console-src');
const outDir = path.join(root, 'public/console-bank');
const assetDir = path.join(outDir, 'assets');
const tenant = JSON.parse(fs.readFileSync(path.join(root, 'data/tenants/straits-meridian/tenant.json'), 'utf8'));
fs.mkdirSync(assetDir, { recursive: true });

let template = fs.readFileSync(path.join(srcDir, 'RayShield Console.dc.html'), 'utf8');
fs.copyFileSync(path.join(srcDir, 'support.js'), path.join(assetDir, 'dc-runtime.js'));
fs.copyFileSync(path.join(srcDir, 'assets/rayshield-logo-light.svg'), path.join(assetDir, 'rayshield-logo-light.svg'));

const count = (hay, needle) => hay.split(needle).length - 1;
const once = (hay, needle, repl, label) => { const n = count(hay, needle); if (n !== 1) throw new Error(`patch "${label}" matched ${n} times`); return hay.replace(needle, () => repl); };
const exactly = (hay, needle, repl, n, label) => { const k = count(hay, needle); if (k !== n) throw new Error(`patch "${label}" matched ${k} times, expected ${n}`); return hay.split(needle).join(repl); };
const patched = [];
const P = (_, label) => { patched.push(label); return label; };

// ---------------------------------------------------------------- template (markup) patches
template = once(template, '<script src="./support.js"></script>',
  '<script src="/console/assets/react.js"></script><script src="/console/assets/react-dom.js"></script>' +
  '<script>window.__demoUser = __DEMO_USER_JSON__; window.__seed = __DEMO_SEED_JSON__; window.__S = window.__seed || {}; window.__WHO = (window.__demoUser && window.__demoUser.name) || "Tan Wei Ling"; window.__TODAY = (window.__S.CLOCK && window.__S.CLOCK.today) || "28 Sep 2026";</script>' +
  '<script src="/console-bank/bridge-bank.js"></script><script src="/console-bank/assets/dc-runtime.js"></script>', P('runtime scripts', 'runtime scripts'));
template = once(template, 'src="assets/rayshield-logo-light.svg"', 'src="/console-bank/assets/rayshield-logo-light.svg"', P(0, 'logo path'));
template = once(template, '<div style="font-size:12px;font-weight:500">Priya Nair</div>', '<div style="font-size:12px;font-weight:500">__DEMO_USER_NAME__</div>', P(0, 'sidebar user'));
template = once(template, '{{ roleLabel }} · Northwind Capital</div></div>', '{{ roleLabel }} · ' + tenant.name + '</div><button onClick="{{ signOut }}" title="Sign out of the console" style="margin-top:6px;border:0;background:none;padding:0;color:#4F5BD5;cursor:pointer;font-size:12px">Sign out</button></div>', P(0, 'sidebar tenant + sign out'));
template = once(template, 'color:#C4293A">249</span></button>', 'color:#C4293A">{{ radBadge }}</span></button>', P(0, 'nav blast badge'));
template = once(template, '-.02em;color:#C4293A">249</span>', '-.02em;color:#C4293A">{{ homeBannerN }}</span>', P(0, 'home banner count'));
template = once(template, 'detections in the last 30 days deviating from rules', '{{ homeBannerTitle }}', P(0, 'home banner title'));
template = once(template, 'DLP-blocked agent runs · 38 users · 11 CUEs · 6 MCP sandboxes', '{{ homeBannerSub }}', P(0, 'home banner sub'));
template = once(template, '24 of 24 have a status, reviewer and date.', '{{ svcTotal }} of {{ svcTotal }} have a status, reviewer and date.', P(0, 'all reviewed text'));
template = once(template, '{{ reviewedCount }} of 24 <span', '{{ reviewedCount }} of {{ svcTotal }} <span', P(0, 'review progress'));
template = once(template, '6 of 38 users · sorted by blocked runs · open one to see its paths', '{{ radRootsLine }}', P(0, 'radius roots line'));
template = once(template, 'Okta · northwind.okta.com', '{{ dirProvider }}', P(0, 'directory provider'));
// Platform sensors: drop the "NE / host" row (not part of this tenant) and bind the Sandbox row to tenant data.
{ const i = template.indexOf('>NE / host</span>'); if (i < 0 || count(template, '>NE / host</span>') !== 1) throw new Error('patch "remove NE / host row" not found');
  const a = template.lastIndexOf('<div ', i), b = template.indexOf('</div>', i) + 6;
  if (template.slice(a, b).includes('<div', 5)) throw new Error('patch "remove NE / host row": unexpected nested markup');
  template = template.slice(0, a).replace(/\n[ \t]*$/, '') + template.slice(b); patched.push('remove NE / host row'); }
{ const i = template.indexOf('Aegis Sandbox · all VMs, short-lived and long-lived, one aggregate row'); const b = template.indexOf('</div>', i);
  if (i < 0) throw new Error('patch "sandbox row" not found');
  let row = template.slice(i, b);
  row = once(row, '>46,000</span>', '>{{ platSbxRecords }}</span>', 'sandbox records'); row = once(row, '>128</span>', '>{{ platSbxUnauth }}</span>', 'sandbox unauthorised'); row = once(row, '>8</span>', '>{{ platSbxVms }}</span>', 'sandbox VMs');
  template = template.slice(0, i) + row + template.slice(b); patched.push('sandbox row bound to tenant data'); }
template = once(template, 'Partial coverage · sensor sase_zscaler has not reported for 3h 12m. Counts below reflect pcap only.', 'Partial coverage · sensor sase_zscaler (remote staff) has not reported for 2 h 40 m. Counts from that sensor stop at 07:20 SGT.', P(0, 'partial coverage banner'));

// Inbox (approvals and notices) under Home; the panel itself is drawn by bridge-bank.js with the same tokens.
template = once(template, `font-weight:400">posture</div></button>`, `font-weight:400">posture</div></button>
  <button onClick="{{ openInbox }}" style="text-align:left;background:{{ inboxBg }};border:0;padding:8px 10px;border-radius:4px;cursor:pointer;color:{{ inboxColor }}"><div style="font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center">Inbox<span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#B4530A">{{ inboxBadge }}</span></div><div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:400">approvals · updates</div></button>`, P(0, 'sidebar inbox'));
// MCP Bridge: onboarded servers can be suspended (kill switch) or deboarded; same button style as Approve / Reject.
template = once(template, `<sc-if value="{{ b.noDecide }}" hint-placeholder-val="{{ true }}"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5b6773;text-align:right">{{ b.meta }}</span></sc-if>`,
  `<sc-if value="{{ b.noDecide }}" hint-placeholder-val="{{ true }}"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5b6773;text-align:right">{{ b.meta }}</span></sc-if>
              <sc-if value="{{ b.canManage }}" hint-placeholder-val="{{ false }}"><span title="{{ b.meta }}" style="display:flex;gap:6px"><button onClick="{{ b.manage }}" disabled="{{ bridgeRO }}" style="border:1px solid #d5dce3;background:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;color:{{ b.manageColor }}">{{ b.manageLabel }}</button><button onClick="{{ b.deboard }}" disabled="{{ bridgeRO }}" style="border:1px solid #d5dce3;background:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;color:#C4293A">Deboard</button></span></sc-if>`, P(0, 'bridge suspend / deboard'));

// ---------------------------------------------------------------- component logic patches
const appRe = /(<script type="text\/x-dc"[^>]*>)([\s\S]*?)(<\/script>)/;
let app = template.match(appRe)[2];

// 1. every design data constant reads the persona seed first
const SEEDED = ['SERVICES', 'ENDPOINTS', 'WINDOWS', 'DEFAULT_LAYOUT', 'ROLES0', 'POLICIES', 'CUE_ROLES', 'FLEET', 'MCP0', 'MCP_CATALOG', 'PROVIDERS', 'MCP_DISC', 'MCP_EPS', 'BRIDGE0', 'ACCESS0', 'RADIUS', 'PROHIBITED_HOSTS', 'CUES0', 'DET_GROUPS', 'DET_RULES', 'DET_EPS', 'DET_ROWS', 'DET_EVID', 'USAGE_SUMMARY', 'USAGE_GROUPS', 'USAGE_USERS', 'USAGE_RATES', 'USAGE_RECENT', 'SESSIONS'];
for (const name of SEEDED) {
  const re = new RegExp(`^const ${name}\\s*=\\s*`, 'm');
  const hits = app.match(new RegExp(`^const ${name}\\s*=\\s*`, 'gm')) || [];
  if (hits.length !== 1) throw new Error(`seed patch "${name}" matched ${hits.length} times`);
  app = app.replace(re, `const ${name} = (__S.${name} !== undefined) ? __S.${name} : `);
  patched.push('seed ' + name);
}
app = once(app, "FLEET.forEach((e, i) => {\n  e.role =", "(__S.FLEET ? [] : FLEET).forEach((e, i) => {\n  e.role =", P(0, 'fleet derive skip'));
app = once(app, "const LS = 'rs-discover-layouts-v3';", "const LS = 'rs-discover-layouts-v3-' + (__S.PERSONA || 'default');", P(0, 'layout key per persona'));

// 2. who is acting, and today's date (before the generic name replacement below)
{ const a = app.indexOf("accessRows: [['Priya Nair','priya.nair@northwind.example'"), b = app.indexOf('].map(u => ({ name: u[0], email: u[1]', a);
  if (a < 0 || b < 0 || count(app, "accessRows: [['Priya Nair'") !== 1) throw new Error('patch "console access rows" not found');
  app = app.slice(0, a) + 'accessRows: ((__S.TEXT && __S.TEXT.accessRows) || [])' + app.slice(b + 1); patched.push('console access rows'); }
app = once(app, "ref: 'requested by ' + m.user + ' · approved by Priya Nair'", "ref: 'requested by ' + m.user + ' · approved by ' + __WHO", P(0, 'approve ref'));
app = once(app, "decMeta: 'Priya Nair · today'", "decMeta: __WHO + ' · today'", P(0, 'decision meta'));
app = once(app, "by: 'added by Priya Nair'", "by: 'added by ' + __WHO", P(0, 'onboard by'));
app = exactly(app, "ref: 'Priya Nair · this draft'", "ref: __WHO + ' · this draft'", 2, P(0, 'draft ref'));
app = once(app, "  setStatus(s, status) {\n    const reviewer = 'Priya Nair', date = '11 Sep 2026';",
  "  setStatus(s, status, fromServer) {\n    const B = window.__demoBridge; if (!fromServer && B && !B.onSetStatus(s, status)) return;\n    const reviewer = (fromServer && fromServer.by) || __WHO, date = __TODAY;", P(0, 'set status via server'));
const priyaInLogic = count(app.slice(app.indexOf('class Component')), "'Priya Nair'");
app = app.slice(0, app.indexOf('class Component')) + app.slice(app.indexOf('class Component')).split("'Priya Nair'").join('__WHO');
patched.push(`who-acted (${priyaInLogic} × 'Priya Nair' → current user)`);
for (const d of ["'24 Sep 2026'", "'27 Sep 2026'"]) { const n = count(app.slice(app.indexOf('class Component')), d); app = app.slice(0, app.indexOf('class Component')) + app.slice(app.indexOf('class Component')).split(d).join('__TODAY'); patched.push(`${n} × ${d} → today`); }
{ const cls = app.indexOf('class Component'); let body = app.slice(cls);
  body = exactly(body, 'ci.northwind.internal', 'ci.' + tenant.domain, count(body, 'ci.northwind.internal'), 'ci host');
  body = body.split("'Marcus Chen'").join("'Tan Wei Ling'").split('Marcus Chen').join('Tan Wei Ling').split("'Tomas Weiler'").join("'Arjun Menon'").split('okta-groups-2026-09.json').join('entra-groups-2026-09.json').split('read from Okta').join('read from Entra ID');
  app = app.slice(0, cls) + body; patched.push('residual Northwind names in logic'); }

// 3. state defaults
app = once(app, "page: 'home', window: 'Daily',", "page: 'home', window: __S.DEFAULT_WINDOW || 'Daily',", P(0, 'default window'));
app = once(app, "radSel: 'k', radRun: 'run-7f3a21',", "radSel: (RADIUS[0] || {}).id, radRun: ((RADIUS[0] || { runs: [{}] }).runs[0] || {}).id,", P(0, 'radius default'));
app = once(app, "selRole: 'contractor',", "selRole: (ROLES0[0] || {}).id,", P(0, 'group default'));
app = once(app, "cueSel: 'cc-eng',", "cueSel: ((CUES0[1] || CUES0[0]) || {}).id,", P(0, 'cue default'));
app = once(app, "dirSynced: '14:00',", "dirSynced: (__S.TEXT ? __S.TEXT.directory.synced : '14:00'),", P(0, 'directory sync time'));

// 4. role, data state, group names, CUE counts, drafts, drift per tool
app = once(app, "const role = p.role ?? 'Security', directory = p.directoryConnected ?? true, dataState = p.dataState ?? 'normal';",
  "const role = (window.__demoUser && window.__demoUser.role) || p.role || 'Security', directory = p.directoryConnected ?? true, dataState = __S.DATA_STATE || p.dataState || 'normal';", P(0, 'role + data state'));
app = once(app, "roleLabel: role, isDiscoverPage", "roleLabel: (window.__demoUser && window.__demoUser.roleLabel) || role, isDiscoverPage", P(0, 'role label'));
app = once(app, "return (this.state.roles.find(r => r.id === id) || { name: id }).name; }", "return (this.state.roles.find(r => r.id === id) || { name: (__S.ROLE_NAMES || {})[id] || id }).name; }", P(0, 'role names'));
app = once(app, "cueFor(role, tool) { return this.state.cues.find(c => c.role === role && c.tool === tool && c.state !== 'retired'); }", "cueFor(role, tool) { return this.state.cues.find(c => c.role === role && c.tool === tool && c.state !== 'retired' && c.state !== 'draft'); }", P(0, 'cueFor skips drafts'));
app = once(app, "e.behind && t === 'claude-code' && c.v > 1", "e.behind && t === (e.behindTool || 'claude-code') && c.v > 1", P(0, 'drift per tool'));
app = once(app, "  cueCounts(c) {\n    if (c.state === 'retired')", "  cueCounts(c) {\n    if (!c) return { running: 0, older: 0 };\n    if (c.fixedCounts) return c.fixedCounts;\n    if (c.state === 'retired')", P(0, 'fixed CUE counts'));
{ const cls = app.indexOf('class Component'); const n = count(app.slice(cls), "'cc-con'"); if (n !== 6) throw new Error('patch "import CUE id" matched ' + n + ' times, expected 6');
  app = app.slice(0, cls) + app.slice(cls).split("'cc-con'").join("(__S.IMPORT_CUE || 'cc-con')"); patched.push('import dialog CUE id'); }
app = once(app, "const SIGN = { signed: ['signed', '#157F4E'], unsigned: ['unsigned', warn], retired: ['retired', '#9aa5b1'] };", "const SIGN = { signed: ['signed', '#157F4E'], unsigned: ['unsigned', warn], retired: ['retired', '#9aa5b1'], draft: ['draft · not published', '#7C8CFF'] };", P(0, 'draft CUE state'));

// 5. writes go through the server (bridge returns false when it has posted and will apply via SSE)
app = once(app, "  approveMcp(m, targets) {\n", "  approveMcp(m, targets, fromServer) {\n    const B = window.__demoBridge; if (!fromServer && B && !B.onApproveMcp(m)) return; if (B) targets = [];\n", P(0, 'approve MCP via server'));
app = once(app, "deny: () => this.setState(s => ({ mcp: s.mcp.map(x => x.id === m.id ? { ...x, decision: 'denied' } : x), mcpLast: { id: m.id, decision: 'denied' } })),",
  "deny: () => { const B = window.__demoBridge; if (B && !B.onDenyMcp(m)) return; this.setState(s => ({ mcp: s.mcp.map(x => x.id === m.id ? { ...x, decision: 'denied' } : x), mcpLast: { id: m.id, decision: 'denied' } })); },", P(0, 'deny MCP via server'));
app = once(app, "approve: () => { if (ro) return; setB(b.id,", "approve: () => { if (ro) return; const B = window.__demoBridge; if (B && !B.onBridgeDecision(b, 'approved')) return; setB(b.id,", P(0, 'bridge approve via server'));
app = once(app, "reject: () => { if (!ro) setB(b.id,", "reject: () => { const B = window.__demoBridge; if (B && !B.onBridgeDecision(b, 'blocked')) return; if (!ro) setB(b.id,", P(0, 'bridge reject via server'));
app = once(app, "toggle: () => { if (ro) return; this.setState(s => ({ access:", "toggle: () => { if (ro) return; const B = window.__demoBridge; if (B && !B.onAccessToggle(b.name, gp.id, !on)) return; this.setState(s => ({ access:", P(0, 'group MCP policy via server'));
app = once(app, "obSubmit: () => { const name = (st.obName || '').trim();", "obSubmit: () => { if (window.__demoBridge) { window.__demoBridge.onOnboard((st.obName || '').trim(), (st.obSource || '').trim()); return; } const name = (st.obName || '').trim();", P(0, 'onboard via server'));
app = once(app, "  publishGen() {\n    const st = this.state", "  publishGen() {\n    if (window.__demoBridge && !window.__demoBridge.onPublishGen(this.state.gen)) return;\n    const st = this.state", P(0, 'publish CUE via server'));
app = once(app, "doRetire: () => { if (n.running) return;", "doRetire: () => { if (n.running) return; if (window.__demoBridge && !window.__demoBridge.can('deleteCue')) return;", P(0, 'retire gate'));
app = once(app, "createRole: () => { const n = st.nr; if (!n.name.trim()) return;", "createRole: () => { const n = st.nr; if (!n.name.trim()) return; if (window.__demoBridge && !window.__demoBridge.can(n.editId ? 'assignPolicy' : 'createGroup')) return;", P(0, 'group create gate'));
app = once(app, "importApply: () => this.setState(s => {", "importApply: () => (window.__demoBridge && !window.__demoBridge.can('editCue')) ? null : this.setState(s => {", P(0, 'import gate'));
app = once(app, "MODES = st.capModes || {}, ro = role === 'Viewer';", "MODES = st.capModes || {}, ro = role === 'Viewer' || !!(window.__demoBridge && !window.__demoBridge.has('settingsWrite'));", P(0, 'settings read-only'));
app = once(app, "syncDirectory: () => { this.setState({ dirSyncing: true });", "syncDirectory: () => { if (window.__demoBridge && !window.__demoBridge.can('settingsWrite')) return; this.setState({ dirSyncing: true });", P(0, 'directory sync gate'));
app = once(app, "componentDidMount() {\n    this._timer", "componentDidMount() {\n    if (window.__demoBridge) window.__demoBridge.attach(this);\n    this._timer", P(0, 'bridge attach'));

// 6. overview (Discover): totals from the service list, seed text, persona overrides
app = once(app, "onlineDevices: String(Math.round(W.ep * 1.6))", "onlineDevices: __S.FLEET ? String(__S.FLEET.filter(e => !e.noAgent && !e.offline).length) : String(Math.round(W.ep * 1.6))", P(0, 'online devices'));
app = once(app, "reviewed = 24 - unlabelled;", "reviewed = SERVICES.length - unlabelled;", P(0, 'reviewed of N'));
app = once(app, "value: reviewed + ' of 24'", "value: reviewed + ' of ' + SERVICES.length", P(0, 'governance tile of N'));
app = exactly(app, "reviewed / 24 * 100", "reviewed / SERVICES.length * 100", 2, P(0, 'coverage pct'));
app = once(app, "' · 24 active in last 30d'", "' · ' + SERVICES.length + ' active in last 30d'", P(0, 'services count line'));
app = once(app, "const ATTN_ORDER = [", "const ATTN_ORDER = (__S.TEXT && __S.TEXT.attnOrder) || [", P(0, 'attention order'));
app = once(app, "shadowDelta: '+2.1 pts ' + W.prev,", "shadowDelta: __S.TEXT ? (W.key === 'Weekly' ? __S.TEXT.shadowDelta : W.prev) : '+2.1 pts ' + W.prev,", P(0, 'shadow delta'));
app = once(app, "      ...this.extVals(page, role, core),\n    };\n  }\n}", "      ...this.extVals(page, role, core),\n      ...(window.__rsOverview ? window.__rsOverview(this, { page, role, W, scale, counts, unlabelled, reviewed, unreviewed, withStatus, openService, active, shadowPct, stale, partial, core, tiles, attention }) : {}),\n    };\n  }\n}", P(0, 'overview overrides'));

// 7. home (planes, attention, banner) per persona
app = once(app, "      ...x,\n    };\n  }\n  extraVals(page, role) {", "      ...x,\n      ...(window.__rsHome ? window.__rsHome(this, page, role, x, d) : {}),\n    };\n  }\n  extraVals(page, role) {", P(0, 'home overrides'));

// 8. detections: seed clock, live detections, seeded evidence, redaction
app = once(app, "const SHIFT = Date.UTC(2026, 8, 29, 20, 30) - Date.UTC(2026, 8, 24, 14, 2);", "const SHIFT = __S.CLOCK ? __S.CLOCK.rawNowMs - __S.CLOCK.nowMs : Date.UTC(2026, 8, 29, 20, 30) - Date.UTC(2026, 8, 24, 14, 2);", P(0, 'detection clock shift'));
app = once(app, "const NOW = Date.UTC(2026, 8, 24, 14, 2), H = 3600e3;", "const NOW = __S.CLOCK ? __S.CLOCK.nowMs : Date.UTC(2026, 8, 24, 14, 2), H = 3600e3;", P(0, 'detection now'));
app = once(app, "(st.dxWin || 'Monthly')", "(st.dxWin || (__S.CLOCK ? 'Weekly' : 'Monthly'))", P(0, 'detection window'));
app = once(app, "detNavBadge: String(DET_ROWS.filter(r => DET_RULES[r[4]][2] === 'critical').length)", "detNavBadge: String([...DET_ROWS, ...(this.state.demoDet || [])].filter(r => DET_RULES[r[4]][2] === 'critical').length)", P(0, 'live detection badge'));
app = once(app, "const allRows = DET_ROWS.map(r => {", "const allRows = [...DET_ROWS, ...(this.state.demoDet || [])].map(r => {", P(0, 'live detections'));
app = once(app, "      return dd;\n    };\n    // ---- detlist ----", "      if (window.__rsEnrich) window.__rsEnrich(dd, x);\n      return dd;\n    };\n    // ---- detlist ----", P(0, 'seeded evidence'));
app = once(app, "desc: rDesc[famRule[0]] || ''", "desc: (__S.RULE_DESC || rDesc)[famRule[0]] || ''", P(0, 'rule descriptions'));
app = once(app, "sub: 'EXFIL, REVSHELL, DESTRUCTION'", "sub: DET_RULES.filter(r => r[2] === 'critical').map(r => r[0]).join(', ')", P(0, 'critical families'));
app = once(app, "sevLabel: x.sev, sevColor: x.sevColor, sevBg: x.sevBg, dispLabel: x.dispLabel,", "sevLabel: x.sev, sevColor: x.sevColor, sevBg: x.sevBg, dispLabel: x.dispLabel, idFull: x.id,", P(0, 'detection id in list'));

// 9. sessions list: seeded rows and real totals
app = once(app, "const all = [...seeds, ...synth].map(s => {", "const all = (__S.SESSION_LIST || [...seeds, ...synth]).map(s => {", P(0, 'session rows'));
app = once(app, "blk: s.id === '7b4fd5287e6e' ? 2 : blk };", "blk: s.id === '7b4fd5287e6e' ? 2 : blk, ...(s.fixed || {}) };", P(0, 'session fixed counts'));
app = once(app, "n: String(k === 'all' ? all.length : all.filter(s => s.shape === k).length)", "n: String(__S.SESSION_TOTALS ? __S.SESSION_TOTALS[k === 'all' ? 'total' : k].toLocaleString() : k === 'all' ? all.length : all.filter(s => s.shape === k).length)", P(0, 'session totals'));
app = once(app, "slCount: filtered.length + ' of ' + all.length + ' sessions'", "slCount: __S.SESSION_TOTALS ? filtered.length + ' listed · ' + __S.SESSION_TOTALS.total.toLocaleString() + ' sessions in the last 7 days' : filtered.length + ' of ' + all.length + ' sessions'", P(0, 'session count line'));
app = once(app, "sessOptions: [opt('clean', 'Clean run', '35 events · no blocks'), opt('detected', 'Two detections', '33 events · 2 blocked'), opt('stopped', 'Budget stop', '53 events · cut mid-run')],",
  "sessOptions: (__S.SESS_OPTIONS || [['clean', 'Clean run', '35 events · no blocks'], ['detected', 'Two detections', '33 events · 2 blocked'], ['stopped', 'Budget stop', '53 events · cut mid-run']]).map(o => opt(o[0], o[1], o[2])),", P(0, 'session options'));

// 10. usage: 7-day period, seeded model costs, wires and colours, capped groups only in budgets
app = once(app, "const win = st.usageWin || '30d';", "const win = st.usageWin || (__S.USAGE_PERIOD ? '7d' : '30d');", P(0, 'usage window'));
app = exactly(app, "Date.UTC(2026, 8, 24), dayMs", "(__S.CLOCK ? __S.CLOCK.nowMs : Date.UTC(2026, 8, 24)), dayMs", 2, P(0, 'usage clock'));
app = once(app, "const modelShareTok = {", "const modelShareTok = __S.USAGE_MODEL_TOK || {", P(0, 'usage token share'));
app = once(app, "mCost[m] = mTok[m] * blend(RATES[m]) / 1e6; });", "mCost[m] = (__S.USAGE_MODEL_COST && !st.rates) ? __S.USAGE_MODEL_COST[m] : mTok[m] * blend(RATES[m]) / 1e6; });", P(0, 'usage model cost'));
app = once(app, "const wireShare = ['Anthropic', 'OpenAI'].map(", "const wireShare = (__S.USAGE_WIRES ? Object.keys(__S.USAGE_WIRES) : ['Anthropic', 'OpenAI']).map(", P(0, 'usage wires'));
app = once(app, "const modelColor = {", "const modelColor = __S.USAGE_MODEL_COLOR || {", P(0, 'usage model colours'));
app = once(app, "const WIRE = { 'Anthropic': H1, 'OpenAI': OAI };", "const WIRE = __S.USAGE_WIRES || { 'Anthropic': H1, 'OpenAI': OAI };", P(0, 'usage wire colours'));
{ const n = count(app, '(nDays / 30)'); app = app.split('(nDays / 30)').join('(nDays / (__S.USAGE_PERIOD || 30))'); patched.push(`usage period scaling (${n})`); if (n < 2) throw new Error('usage period patch matched ' + n); }
app = once(app, "hPerDay: money(cost / 30)", "hPerDay: money(cost / (__S.USAGE_PERIOD || 30))", P(0, 'usage per day'));
app = once(app, "' · last 30d', color: ink },", "' · last ' + (__S.USAGE_PERIOD || 30) + 'd', color: ink },", P(0, 'usage tile window'));
app = once(app, "const PERIOD = 30;", "const PERIOD = __S.USAGE_PERIOD || 30;", P(0, 'budget period'));
app = once(app, "const withRank = USAGE_GROUPS.map(g => ({ ...g,", "const withRank = USAGE_GROUPS.filter(g => g.cap != null).map(g => ({ ...g,", P(0, 'budget capped groups'));
app = once(app, "warnOnly: MODES[g.group] === 'warn',", "warnOnly: MODES[g.group] === 'warn' || !!g.warn,", P(0, 'budget warn mode'));
app = once(app, "const stopRows = stopEvents.sort(", "const stopRows = (__S.USAGE_STOPS || stopEvents).sort(", P(0, 'budget stops'));
app = once(app, "capRows: USAGE_GROUPS.map(g => ({", "capRows: USAGE_GROUPS.filter(g => g.cap != null).map(g => ({", P(0, 'settings caps'));

// 11. runtime blast radius stats from the seed
{ const a = app.indexOf("radStats: [['DLP-blocked runs', '249', 'last 30 days', red],"); const b = app.indexOf('].map(([label, value, sub, color]) => ({ label, value, sub, color })),', a);
  if (a < 0 || b < 0 || count(app, "radStats: [['DLP-blocked runs', '249'") !== 1) throw new Error('patch "radius stats" not found');
  app = app.slice(0, a) + "radStats: (__S.RAD_STATS ? [['DLP-blocked runs', String(RADIUS.reduce((n, r) => n + r.total, 0)), 'last 7 days', red], ['Users', String(new Set(RADIUS.map(r => r.user)).size), 'with a blocked run', '#0B1220'], ['CUEs involved', String(__S.RAD_STATS.cues), 'of ' + __S.RAD_STATS.cuesLive + ' live', '#0B1220'], ['MCP sandboxes', String(__S.RAD_STATS.sandboxes), 'reached by a blocked run', '#0B1220']] : [['DLP-blocked runs', '249', 'last 30 days', red], ['Users', '38', 'with a blocked run', '#0B1220'], ['CUEs involved', '11', 'of 14 live', '#0B1220'], ['MCP sandboxes', '6', 'reached by a blocked run', '#0B1220']])" + app.slice(b + 1);
  patched.push('radius stats'); }

// 12. fleet: offline agent state, 7-day counters, tenant text in the device feed
app = once(app, "const ag = e => e.noAgent ?", "const ag = e => e.offline ? { agent: 'offline', agentColor: '#B4530A' } : e.noAgent ?", P(0, 'offline agent label'));
app = once(app, "const enforcing = FLEET.filter(e => !e.noAgent && !e.recordOnly && !behindOf(e)).length;", "const enforcing = FLEET.filter(e => !e.noAgent && !e.recordOnly && !e.offline && !behindOf(e)).length;", P(0, 'enforcing excludes offline'));
app = once(app, "record: e => e.recordOnly, none: e => e.noAgent };", "record: e => e.recordOnly, offline: e => !!e.offline, none: e => e.noAgent };", P(0, 'offline filter'));
app = once(app, "chip('record', 'Record only'), chip('none', 'No agent')]", "chip('record', 'Record only'), chip('offline', 'Offline'), chip('none', 'No agent')]", P(0, 'offline chip'));
app = once(app, "{ label: 'Blocked · 24h',", "{ label: __S.CLOCK ? 'Blocked · 7d' : 'Blocked · 24h',", P(0, 'fleet blocked label'));
app = once(app, "{ label: 'Recorded · 24h',", "{ label: __S.CLOCK ? 'Recorded · 7d' : 'Recorded · 24h',", P(0, 'fleet recorded label'));
app = once(app, "fleetCountLine: `${Math.min(list.length, st.fleetLimit)} of ${list.length} · last 24h`", "fleetCountLine: `${Math.min(list.length, st.fleetLimit)} of ${list.length} · ${__S.CLOCK ? 'last 7d' : 'last 24h'}`", P(0, 'fleet count line'));
app = once(app, "['IBAN in prompt','Card number in pasted text','Customer email list in attachment']", "(__S.TEXT ? __S.TEXT.deviceDetail.dlp : ['IBAN in prompt','Card number in pasted text','Customer email list in attachment'])", P(0, 'device feed DLP'));
app = once(app, "rule = 'dlp-pii-outbound';", "rule = __S.TEXT ? 'dlp-card-pan' : 'dlp-pii-outbound';", P(0, 'device feed DLP rule'));
app = once(app, "['egress api.perplexity.ai not listed','MCP server linear not listed','write to ~/Documents not listed']", "(__S.TEXT ? __S.TEXT.deviceDetail.notInCue : ['egress api.perplexity.ai not listed','MCP server linear not listed','write to ~/Documents not listed'])", P(0, 'device feed not-in-CUE'));
app = once(app, "'Source from payments-integration in prompt'", "(__S.TEXT ? __S.TEXT.deviceDetail.recorded : 'Source from payments-integration in prompt')", P(0, 'device feed recorded'));
app = once(app, "'unapproved-ai-record' : 'dlp-source-code';", "'unapproved-ai-record' : (__S.TEXT ? 'dlp-source-archive' : 'dlp-source-code');", P(0, 'device feed record rule'));
app = once(app, "const AGSVC = { 'claude-code': 'Anthropic Claude', 'gemini-cli': 'Google Gemini', 'codex-cli': 'OpenAI ChatGPT' };", "const AGSVC = (__S.TEXT && __S.TEXT.deviceDetail.agentSvc) || { 'claude-code': 'Anthropic Claude', 'gemini-cli': 'Google Gemini', 'codex-cli': 'OpenAI ChatGPT' };", P(0, 'device feed agent services'));
app = once(app, "let tMin = 13 * 60 + 58;", "let tMin = __S.CLOCK ? 9 * 60 + 58 : 13 * 60 + 58;", P(0, 'device feed clock'));
app = once(app, "new Date(2026, 8, 24 - Math.floor(", "new Date(2026, 8, (__S.CLOCK ? 28 : 24) - Math.floor(", P(0, 'device feed dates'));

// 14. MCP Bridge: suspend / deboard onboarded servers, time-limited group access shown next to each grant
app = once(app, "Rejected: 'Prohibited' };", "Rejected: 'Prohibited', Suspended: 'Prohibited' };", P(0, 'suspended chip'));
app = once(app, "canDecide: b.status === 'Awaiting approval', noDecide: b.status !== 'Awaiting approval', meta: b.date + ' · ' + b.by,",
  "canDecide: b.status === 'Awaiting approval', canManage: !!window.__demoBridge && ['Onboarded', 'Suspended'].includes(b.status), noDecide: b.status !== 'Awaiting approval' && !(window.__demoBridge && ['Onboarded', 'Suspended'].includes(b.status)), meta: b.date + ' · ' + b.by, manageLabel: b.status === 'Suspended' ? 'Reinstate' : 'Suspend', manageColor: b.status === 'Suspended' ? '#157F4E' : '#B4530A', manage: () => window.__demoBridge.onSuspendMcp(b), deboard: () => window.__demoBridge.onDeboardMcp(b),", P(0, 'bridge row actions'));
app = once(app, "gp => gp.name).join(', ') || 'no group yet'", "gp => gp.name + (window.__rsExp ? window.__rsExp(b.name, gp.id) : '')).join(', ') || 'no group yet'", P(0, 'bridge access expiry'));
app = once(app, "label: on ? 'Allowed' : 'Denied'", "label: on ? 'Allowed' + (window.__rsExp ? window.__rsExp(b.name, gp.id, true) : '') : 'Denied'", P(0, 'access grid expiry'));

// 15. live mode (Fleet data): open a session's own activity when the seed has it, not only the three samples
app = once(app, "const c = st.cues.find(x => x.id === st.cueSel) || st.cues[0], n = this.cueCounts(c);", "const c = st.cues.find(x => x.id === st.cueSel) || st.cues[0] || { id: '', tool: TOOL_IDS[0], role: (ROLES0[0] || {}).id, v: 0, state: 'unsigned', pub: '—', by: '—', how: 'No CUE yet', env: [], hist: [] }, n = this.cueCounts(c);", P(0, 'cue empty state'));
app = once(app, "const e = FLEET.find(x => x.id === st.detailId) || FLEET.find(x => x.behind && x.user && x.tools.length > 1) || FLEET[0];", "const e = FLEET.find(x => x.id === st.detailId) || FLEET.find(x => x.behind && x.user && x.tools.length > 1) || FLEET[0] || { id: '', endpoint_id: '', type: 'laptop', host: 'No devices enrolled yet', ip: '—', user: null, dept: '—', svcCount: 0, daily: 0, firstSeen: '—', ephemeral: false, lastMin: 0, sensor: '—', noAgent: true, recordOnly: false, offline: false, bundleV: null, allowed: 0, blocked: 0, recorded: 0, checkin: '—', role: null, tools: [], devId: 'dev-none', behind: false, behindTool: null };", P(0, 'device empty state'));
app = once(app, "const R = RADIUS.find(r => r.id === st.radSel) || RADIUS[0];", "const R = RADIUS.find(r => r.id === st.radSel) || RADIUS[0] || { id: '', user: '—', ep: '—', cue: '—', total: 0, last: '—', runs: [] };", P(0, 'radius empty state'));
app = once(app, "for (let i = 0; i < 14; i++) {", "for (let i = 0; i < (evGroups.length ? 14 : 0); i++) {", P(0, 'budget stops need groups'));
app = once(app, "const epSel = MCP_EPS[st.mdEp || 0];", "const epSel = MCP_EPS[st.mdEp || 0] || { label: 'No endpoint scans yet', type: '—', items: [] };", P(0, 'MCP scan empty state'));
app = once(app, "const run = allRuns.find(x => x.id === st.radRun) || allRuns[0];", "const run = allRuns.find(x => x.id === st.radRun) || allRuns[0] || { id: '', when: '—', cue: '—', mcp: '—', sbx: '—', cred: '—', data: '—', action: '—', dlpLong: '—' };", P(0, 'radius run empty state'));
app = once(app, "const b = sel ? this.buildFeed(SESSIONS[sel.shape]) : null;", "const b = sel ? this.buildFeed(SESSIONS[sel.id] || SESSIONS[sel.shape]) : null;", P(0, 'session feed by id'));

// 13. settings directory
app = once(app, "dirMapped: directory ? '96 of 133' : '0 of 133',", "dirMapped: directory ? (__S.TEXT ? __S.TEXT.directory.mapped : '96 of 133') : '0 of ' + ENDPOINTS.length,", P(0, 'directory mapped'));

// Fail the build (not the browser) if a patch broke the component's syntax. Parses only; runs nothing.
try { new Function('class DCLogic {}\n' + app); } catch (e) { throw new Error('patched component logic does not parse: ' + e.message); }
template = template.replace(appRe, (_, a, __, c) => a + app + c);

// Remove the design-review branding badge if present (same as the Northwind build).
{ const marker = '<div id="__claude_design_branding">'; const start = template.indexOf(marker);
  if (start >= 0) { let depth = 0, end = -1; const re = /<\/?div\b[^>]*>/gi; re.lastIndex = start; let m; while ((m = re.exec(template))) { if (m[0][1] === '/') { depth--; if (depth === 0) { end = re.lastIndex; break; } } else depth++; } if (end > start) template = template.slice(0, start) + template.slice(end); } }

// Guard: no Northwind residue left in the bank console.
const residue = (template.match(/Northwind|northwind/g) || []).length - (template.slice(0, template.indexOf('<script type="text/x-dc"')).match(/Northwind|northwind/g) || []).length;
const logicResidue = (app.slice(app.indexOf('class Component')).match(/northwind/gi) || []).length;
if (logicResidue) throw new Error('Northwind strings left in component logic: ' + logicResidue);
if (/Northwind/.test(template.slice(0, template.indexOf('<script type="text/x-dc"')))) throw new Error('Northwind string left in console markup');

fs.writeFileSync(path.join(outDir, 'index.html'), template);
console.log('bank console built:', patched.length, 'patches,', Math.round(template.length / 1024), 'KB page · data constants seeded:', SEEDED.length, residue ? '· (design fallback constants still contain ' + residue + ' Northwind strings, unused when seeded)' : '');
