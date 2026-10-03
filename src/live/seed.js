// Builds the console's data constants (window.__seed) from a Fleet snapshot. Live mode only.
// Every constant the console reads is set here, from real Fleet data or as an empty value, so the
// design's built-in sample data (Northwind) never shows. Shapes follow scripts/lib/console-seed.mjs.
const DAY = 86400;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OFF = Math.round(Number(process.env.LIVE_TZ_OFFSET_HOURS || 0) * 3600);
const TZ = process.env.LIVE_TZ_LABEL || (OFF ? 'local' : 'UTC');
const arr = v => (Array.isArray(v) ? v : v && Array.isArray(v.rows) ? v.rows : v && Array.isArray(v.devices) ? v.devices : v && Array.isArray(v.detections) ? v.detections : []);
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '');

export function buildLiveSeed(F, viewer) {
  const now = F.fetchedAt || Math.floor(Date.now() / 1000);
  const disp = t => new Date((t + OFF) * 1000);
  const dDate = t => { const d = disp(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const dDay = t => { if (!t) return '—'; const d = disp(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const hm = t => { const d = disp(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const p2 = n => String(n).padStart(2, '0');
  const rawTs = t => { const d = disp(t); return `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
  const ago = s => s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 172800 ? Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm' : Math.floor(s / 86400) + 'd';
  const redacted = viewer.role === 'ciso';
  const S = {};

  // ---- clock: real time, so "x min ago" and windows line up with Fleet ----
  S.CLOCK = { nowMs: now * 1000, rawNowMs: now * 1000, today: dDate(now), stampHm: hm(now) };
  S.DEFAULT_WINDOW = 'Weekly'; S.USAGE_PERIOD = 7; S.DATA_STATE = 'normal'; S.IMPORT_CUE = '';

  // ---- Discover ----
  const svcs = arr(F.services);
  S.SERVICES = svcs.map((s, i) => ({ id: 'S' + i, service_id: slug(s.ai_service), name: s.ai_service, vendor: s.vendor || s.ai_service, category: cap(s.category) || 'Other', embeddedIn: s.embedded_in || null,
    status: ({ approved: 'Approved', unapproved: 'Unapproved', prohibited: 'Prohibited', under_review: 'Under review', beta: 'Beta' })[s.status] || 'Unlabelled',
    daily: num(s.hits), endpoints: num(s.endpoints) || num(s.users), firstSeen: dDay(s.first_seen), reviewer: s.reviewed_by || null, date: s.reviewed_at ? dDate(s.reviewed_at) : null,
    blurb: [cap(s.category), s.risk_score != null ? 'risk ' + s.risk_score + '/100' : null, s.jurisdiction ? 'jurisdiction ' + s.jurisdiction : null, s.confidence ? s.confidence + ' confidence' : null, s.ever_agentic ? 'agentic use seen' : null].filter(Boolean).join(' · ') }));
  const eps = arr(F.endpoints).slice().sort((a, b) => num(b.hits) - num(a.hits));
  const userOf = ip => { const u = arr(F.users).find(x => x.person === ip); return u && u.person !== ip ? u.person : null; };
  S.ENDPOINTS = eps.map((e, i) => ({ id: 'E' + i, endpoint_id: 'ep_' + slug(e.host || e.endpoint), type: e.type === 'vm' ? 'VM' : e.type || 'other', host: e.host || e.endpoint, ip: e.endpoint || '—', user: e.user || userOf(e.endpoint),
    dept: e.department || e.dept || 'Unmapped', svcCount: num(e.services), daily: num(e.hits), firstSeen: dDay(e.first_seen), ephemeral: !!e.ephemeral, lastMin: e.last_seen ? Math.max(0, Math.floor((now - e.last_seen) / 60)) : 0, sensor: e.sensor || 'pcap' }));
  const devs = arr(F.devices).length ? arr(F.devices) : arr(F.devicesPublic);
  S.FLEET = devs.map((d, i) => {
    const last = num(d.last_seen || d.last_heartbeat), off = d.status && d.status !== 'active';
    return { id: 'D' + i, endpoint_id: 'dev_' + (d.id || i), type: 'laptop', host: d.hostname || d.device_name || d.id, ip: d.ip || '—', user: d.device_owner || d.owner || null, dept: 'Unmapped', svcCount: 0, daily: 0, firstSeen: '—', ephemeral: false,
      lastMin: last ? Math.max(0, Math.floor((now - last) / 60)) : 0, sensor: 'agent', noAgent: false, recordOnly: false, offline: !!off, bundleV: null, allowed: 0, blocked: num(d.blocks_24h), recorded: 0,
      checkin: last ? ago(now - last) + ' ago' : '—', role: null, tools: [], devId: 'dev-' + String(d.id || i).slice(0, 8), behind: false, behindTool: null };
  });
  const wins = [['Live', 'last 10s', 10 / (7 * DAY), 'vs previous 10s'], ['Hourly', 'last 1h', 1 / 168, 'vs previous hour'], ['Daily', 'last 24h', 1 / 7, 'vs previous day'], ['Weekly', 'last 7d', 1, 'vs previous week'], ['Monthly', 'last 30d', 30 / 7, 'vs previous month']];
  const axisFor = k => k === 'Live' ? ['-60s', '-45s', '-30s', '-15s', 'now'] : k === 'Hourly' ? [-60, -45, -30, -15, 0].map(m => hm(now + m * 60)) : k === 'Daily' ? [-24, -18, -12, -6, 0].map(h => hm(now + h * 3600))
    : k === 'Weekly' ? [-6, -4, -2, -1, 0].map(d => d === 0 ? 'Today' : dDay(now + d * DAY)) : [-28, -21, -14, -7, 0].map(d => d === 0 ? 'Today' : dDay(now + d * DAY));
  S.WINDOWS = wins.map(([key, short, scale, prev]) => ({ key, label: key, short, scale, svc: S.SERVICES.length, ep: S.ENDPOINTS.length, prev, axis: axisFor(key) }));
  S.PROVIDERS = []; S.MCP_DISC = []; S.MCP_EPS = [];

  // ---- Control (Fleet has no groups or CUEs yet) ----
  // The console needs at least one group; until Fleet has groups, every endpoint is in one scope.
  S.CUE_ROLES = ['all']; S.ROLE_NAMES = { all: 'All endpoints' };
  S.ROLES0 = [{ id: 'all', api_id: 'all', name: 'All endpoints', desc: 'Fleet has no groups yet, so every endpoint is in this one scope.', owner: '—', memberList: [], review: '—', overdue: false, grants: [], active: true }];
  S.CUES0 = []; S.ACCESS0 = {}; S.MCP0 = []; S.PROHIBITED_HOSTS = {};
  const mcps = arr(F.mcps);
  S.BRIDGE0 = mcps.map(m => ({ id: m.id || 'mcp_' + slug(m.name), name: m.name, source: m.source || m.url || m.command || '—',
    scan: (m.risk_score != null ? 'risk ' + m.risk_score : 'scan ' + (m.scan_status || 'pending')) + (m.findings_summary ? ' · ' + m.findings_summary : ''), lvl: m.risk_tier === 'high' ? 'high' : m.risk_tier === 'medium' ? 'medium' : 'ok',
    tools: Array.isArray(m.tools) ? m.tools.map(t => t.name || t).join(' · ') : '', status: m.status === 'approved' ? 'Onboarded' : m.status === 'blocked' || m.status === 'revoked' ? 'Rejected' : 'Awaiting approval',
    date: m.updated_at || m.created_at ? dDate(num(m.updated_at || m.created_at)) : '—', by: m.approved_by || m.decided_by || '—' }));
  S.MCP_CATALOG = mcps.map(m => [m.name, Array.isArray(m.tools) ? m.tools.map(t => t.name || t).join(' · ') : '', null]);
  S.POLICIES = arr(F.policies).map(p => ({ name: p.sentence || p.name || p.id, rule: [p.action, p.what].filter(Boolean).join(' · '), mode: /enforc/i.test(p.state || '') ? 'Enforce' : 'Record', scope: p.scope || p.who || '—', hits: String(num(p.hits_30d)) }));

  // ---- Protect: detections (v2.1 list when signed in to Fleet; otherwise denied decisions from the public stream) ----
  let dets = arr(F.detections).map(d => ({ id: d.id, ts: num(d.ts), rule: d.rule_id || 'DETECTION', sev: d.severity || 'medium', action: d.action || 'block', host: d.device_id || 'unknown', sid: d.session_id || '', model: d.model || '',
    matched: redacted ? null : d.matched_content || null, prompt: redacted ? null : d.prompt || null }));
  if (!dets.length) dets = arr(F.decisions).filter(x => /deny|block/i.test(x.decision || '')).map(x => ({ id: x.id, ts: num(x.ts), rule: x.rule_id || (x.action === 'network' ? 'BLOCKED-EGRESS' : 'BLOCKED-' + String(x.action || 'ACTION').toUpperCase()),
    sev: 'medium', action: 'block', host: x.identity || x.device || 'unknown', sid: x.device || '', model: '', matched: redacted ? null : x.target || null, prompt: null, target: x.target, reason: x.reason }));
  const rules = [...new Set(dets.map(d => d.rule))];
  const sevOf = r => (dets.find(d => d.rule === r) || {}).sev;
  S.DET_RULES = rules.map(r => [r, r.replace(/[-_]+/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()), ['critical', 'high', 'medium', 'low'].includes(sevOf(r)) ? sevOf(r) : 'medium', '—', 'Fleet']);
  S.RULE_DESC = Object.fromEntries(rules.map(r => [r, 'Reported by Fleet.']));
  const detHosts = [...new Set(dets.map(d => d.host))];
  S.DET_GROUPS = [];
  S.DET_EPS = detHosts.map(h => [h, '—', 'person', 0, -1, null]);
  S.DET_ROWS = dets.map(d => [d.id, d.sid, detHosts.indexOf(d.host), rawTs(d.ts), rules.indexOf(d.rule), d.action === 'warn' || d.action === 'record' ? 'r' : 'b']);
  S.DET_EVID = {};
  S.DET_EVIDENCE = Object.fromEntries(dets.map(d => [d.id, redacted ? { type: 'sensitive_content', redacted: true, teaser: d.rule + ' · evidence redacted for your role' }
    : { type: 'sensitive_content', teaser: [d.rule, d.target ? '→ ' + d.target : null, d.reason].filter(Boolean).join(' · '), content: d.matched || d.prompt ? { path: d.target || d.model || '', basis: d.rule, pat: d.rule, snippet: String(d.matched || d.prompt).slice(0, 200) } : null, exfil: null, undis: null, signature: null }]));
  S.RADIUS = []; S.RAD_STATS = { runs: 0, users: 0, cues: 0, cuesLive: 0, sandboxes: 0 };

  // ---- Protect: sessions ----
  const sess = arr(F.sessions).slice().sort((a, b) => num(b.last_seen) - num(a.last_seen));
  const shapeOf = s => (num(s.dlp) > 0 || num(s.denies) > 0 ? 'detected' : 'clean');
  const identityOf = s => { const a = (F.activity || {})[s.sid]; return (a && a.origin && a.origin.identity) || s.identity || '—'; };
  S.SESSION_LIST = sess.map(s => ({ id: s.sid, shape: shapeOf(s), host: s.name || '—', owner: identityOf(s), group: '—', ts: num(s.started) + OFF, fixed: { ev: num(s.actions) + num(s.egress) + num(s.prompts), det: num(s.dlp), blk: num(s.denies) } }));
  S.SESSION_TOTALS = { total: sess.length, clean: sess.filter(s => shapeOf(s) === 'clean').length, detected: sess.filter(s => shapeOf(s) === 'detected').length, stopped: 0 };
  const feed = (sid, a) => {
    const origin = (a && a.origin) || {};
    const ev = ((a && a.activity) || []).slice().sort((x, y) => num(x.first_ts) - num(y.first_ts)).map(x => ({
      c: x.cat || 'agent', k: x.kind || '', l: (x.label || '') + (num(x.count) > 1 ? ' ×' + x.count : ''), d: redacted && x.cat === 'prompt' ? '' : x.detail ? String(x.detail).slice(0, 160) : '',
      v: /deny|block/i.test(x.verdict || '') || x.cat === 'detection' ? 'blocked' : 'ok', s: x.severity || '', t: num(x.first_ts) + OFF }));
    return { session: sid, origin: { source: origin.source || 'sandbox', writable: !!origin.writable, profile: origin.profile || '—', workspace: origin.workspace || '—', identity: origin.identity || '—',
      initial_prompt: redacted ? null : origin.initial_prompt ? String(origin.initial_prompt).slice(0, 300) : null },
      boot: (a && a.boot && Array.isArray(a.boot.items)) ? a.boot : { count: 0, items: [] }, ev };
  };
  S.SESSIONS = {};
  for (const [sid, a] of Object.entries(F.activity || {})) if (a) S.SESSIONS[sid] = feed(sid, a);
  const firstOf = shape => sess.find(s => shapeOf(s) === shape && S.SESSIONS[s.sid]);
  const empty = { session: '—', origin: { source: '—', writable: false, profile: '—', workspace: '—', identity: '—', initial_prompt: null }, boot: { count: 0, items: [] }, ev: [] };
  const fd = firstOf('detected'), fc = firstOf('clean');
  S.SESSIONS.detected = fd ? S.SESSIONS[fd.sid] : empty; S.SESSIONS.clean = fc ? S.SESSIONS[fc.sid] : empty; S.SESSIONS.stopped = empty;
  S.SESS_OPTIONS = [['detected', 'Latest with blocks', fd ? fd.name + ' · ' + num(fd.denies) + ' blocked' : 'none in the last 7 days'], ['clean', 'Latest clean run', fc ? fc.name + ' · ' + fc.sid : 'none in the last 7 days'], ['stopped', 'Budget stop', 'none reported']];

  // ---- Usage ----
  const u = F.usage || {};
  S.USAGE_SUMMARY = { turns: num(u.turns), users: num(u.users), sessions: num(u.sessions), cost: Math.round(num(u.cost_usd) * 100) / 100, tokens: num(u.tokens) };
  S.USAGE_USERS = arr(F.usageUsers).map(x => ({ person: x.person, turns: num(x.turns), sessions: num(x.sessions), input: num(x.input || x.input_tokens), output: num(x.output || x.output_tokens), cost: Math.round(num(x.cost_usd) * 100) / 100 }));
  S.USAGE_GROUPS = arr(F.usageByGroup).map(g => ({ group: g.group_name || g.group_id, roleId: g.group_id, devices: 0, sessions: num(g.sessions), turns: 0, tokens: num(g.tokens), cost: Math.round(num(g.cost_usd) * 100) / 100,
    cap: (arr(F.budgets).find(b => b.group_id === g.group_id) || {}).daily_cap ?? null, warn: (arr(F.budgets).find(b => b.group_id === g.group_id) || {}).mode === 'warn', stops: 0 }));
  const recent = arr(F.usageRecent);
  const byModel = {};
  for (const r of arr(F.usageByModel)) byModel[r.model] = { cost: num(r.cost_usd), tok: num(r.input_tokens) + num(r.output_tokens) };
  if (!Object.keys(byModel).length) for (const r of recent) { const m = r.model || 'unknown'; byModel[m] = byModel[m] || { cost: 0, tok: 0 }; byModel[m].cost += num(r.cost_usd); byModel[m].tok += num(r.input) + num(r.output) || 1; }
  const wire = m => /claude|anthropic/i.test(m) ? 'Anthropic' : /gpt|openai|o\d/i.test(m) ? 'OpenAI' : /gemini|google/i.test(m) ? 'Google' : 'Other';
  const RATE = { Anthropic: [3, 15, 0.3], OpenAI: [1.25, 10, 0.125], Google: [1.25, 10, 0.31], Other: [1, 4, 0.1] };
  const models = Object.keys(byModel); const totTok = models.reduce((a, m) => a + byModel[m].tok, 0) || 1;
  S.USAGE_RATES = Object.fromEntries(models.map(m => [m, { wire: wire(m), input: RATE[wire(m)][0], output: RATE[wire(m)][1], cache: RATE[wire(m)][2] }]));
  S.USAGE_MODEL_COST = Object.fromEntries(models.map(m => [m, Math.round(byModel[m].cost * 100) / 100]));
  S.USAGE_MODEL_TOK = Object.fromEntries(models.map(m => [m, byModel[m].tok / totTok]));
  const WC = { Anthropic: '#4F5BD5', Google: '#0B5A61', OpenAI: '#7c8896', Other: '#B4530A' };
  S.USAGE_WIRES = Object.fromEntries([...new Set(models.map(wire))].map(w => [w, WC[w]]));
  const MC = ['#4F5BD5', '#0B5A61', '#7c8896', '#B4530A', '#8a6d1f'];
  S.USAGE_MODEL_COLOR = Object.fromEntries(models.map((m, i) => [m, MC[i % MC.length]]));
  S.USAGE_RECENT = recent.slice(0, 12).map(r => ({ ts: num(r.ts) + OFF, person: r.person || '—', model: r.model || '—', cost: Math.round(num(r.cost_usd) * 10000) / 10000, prompt: redacted ? '[redacted for your role]' : String(r.prompt || '').slice(0, 160) }));
  S.USAGE_STOPS = [];

  // ---- text the console shows in fixed places ----
  const sens = F.sensors || {};
  const sensorRows = [...arr(sens.discovery), ...arr(sens.endpoint)];
  const silentMin = t => t ? Math.floor((now - t) / 60) : null;
  S.TEXT = {
    org: process.env.LIVE_ORG_NAME || 'Fleet (live)', footer: 'Live data · Fleet API',
    freshness: 'Live from Fleet · fetched ' + hm(now) + ' ' + TZ + (sensorRows.length ? ' · ' + sensorRows.map(x => x.sensor + ' ' + (silentMin(x.last_seen) == null ? 'no data' : silentMin(x.last_seen) < 15 ? 'reporting' : 'last seen ' + ago(now - x.last_seen) + ' ago')).join(' · ') : ''),
    shadowDelta: '',
    sensors: sensorRows.map((x, i) => ({ name: x.sensor, desc: x.family === 'discovery' ? 'Shield discovery sensor' : 'Endpoint sensor · ' + (x.source || x.family), endpoints: x.family === 'discovery' ? S.ENDPOINTS.length : num(x.labels),
      services: num(x.services), requests: num(x.rows) || num(x.events), lastSeen: x.last_seen ? ago(now - x.last_seen) + ' ago' : '—',
      health: x.last_seen && now - x.last_seen < 900 ? 'reporting' : 'not reporting', color: x.last_seen && now - x.last_seen < 900 ? '#4F5BD5' : '#b42318' })),
    directory: { provider: 'Not connected', mapped: '—', synced: '—' },
    decisions: [], attnOrder: [],
    deviceDetail: { dlp: [], notInCue: [], recorded: '—', agentSvc: { 'claude-code': 'Claude Code', 'gemini-cli': 'Gemini CLI', 'codex-cli': 'Codex CLI' } },
    platformSandbox: { records: String(num((arr(sens.endpoint).find(x => x.source === 'sandbox') || {}).events)), unauthorised: String(num((arr(sens.endpoint).find(x => x.source === 'sandbox') || {}).blocks)), vms: String(new Set(sess.map(s => s.sid)).size) },
    frameworks: [], accessRows: viewer.email ? [[viewer.name, viewer.email, viewer.roleLabel, 'now']] : [],
  };
  S.HOME_FACTS = { journeyNext: '—', zscalerSilent: '—', contractorsRecert: '—', confluence: '', records_left_bank: 0, decisions: [] };
  S.LIVE = { fetchedAt: now, tz: TZ, signedInToFleet: !!viewer.fleet, posture: F.posture || null, risks: arr(F.risks), approvals: arr(F.approvals), summary: F.summary || null, summaryPrev: F.summaryPrev || null,
    changes: arr(F.changes), categories: arr(F.categories), agents: arr(F.agents), reachable: !!F.reachable, detectionsFrom: arr(F.detections).length ? 'Fleet detections API' : 'denied decisions in the public stream' };
  S.HOME_KEY = viewer.role === 'ciso' ? 'ciso' : viewer.role === 'security' ? 'security' : 'admin';
  S.PERSONA = 'live-' + viewer.role;
  if (redacted) S.REDACTED = true;
  return S;
}
