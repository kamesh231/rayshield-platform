// Maps canonical.json into the Claude Design console's own data-constant shapes (SERVICES, ENDPOINTS,
// FLEET, CUES0, DET_ROWS, …). Output = { base, personas: { <login>: overlay } }; the server merges
// base + overlay into window.__seed for the signed-in persona. Shapes follow the constants in
// design/console-src/RayShield Console.dc.html — see scripts/apply-tenant.mjs for where each is read.

export function buildConsoleSeed(C, personas) {
  const M = C.meta, NOW = M.now, OFF = M.display_offset_s;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const disp = t => new Date((t + OFF) * 1000);                       // SGT wall-clock via UTC getters
  const dDate = t => { const d = disp(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const dDay = t => { const d = disp(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const hm = t => { const d = disp(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const p2 = n => String(n).padStart(2, '0');
  const rawTs = t => { const d = disp(t); return `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
  const when = t => { const days = Math.floor((NOW + OFF) / 86400) - Math.floor((t + OFF) / 86400); return days === 0 ? 'Today ' + hm(t) : days === 1 ? 'Yesterday ' + hm(t) : dDay(t) + ' ' + hm(t); };
  const ago = s => s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm';
  const G = Object.fromEntries(C.groups.map(g => [g.id, g]));
  const cid = gid => gid ? G[gid].console_id : null;
  const STATUS = { approved: 'Approved', unapproved: 'Unapproved', prohibited: 'Prohibited', under_review: 'Under review', beta: 'Beta', unlabelled: 'Unlabelled' };
  const TOOLNAME = { 'claude-code': 'Claude Code', 'gemini-cli': 'Gemini CLI', 'codex-cli': 'Codex CLI', 'claude-desktop': 'Claude Desktop' };
  const base = {};

  // ---- Discover ----
  base.SERVICES = C.services.map((s, i) => ({ id: 'S' + i, service_id: s.service_id, name: s.ai_service, vendor: s.vendor, category: s.category, embeddedIn: s.embedded_in, status: STATUS[s.status], daily: s.hits, endpoints: s.endpoints,
    firstSeen: s.is_new && NOW - s.first_seen < 86400 ? 'Today ' + hm(s.first_seen) : dDay(s.first_seen), reviewer: s.reviewed_by, date: s.reviewed_at ? dDate(s.reviewed_at) : null, blurb: s.description }));
  const svcIdx = id => base.SERVICES.findIndex(s => s.service_id === id);
  base.WINDOWS = [
    { key: 'Live', label: 'Live', short: 'last 10s', scale: 0.0000165, svc: 5, ep: 24, prev: 'vs previous 10s', axis: ['-60s', '-45s', '-30s', '-15s', 'now'] },
    { key: 'Hourly', label: 'Hourly', short: 'last 1h', scale: 0.0071, svc: 11, ep: 96, prev: 'vs previous hour', axis: ['09:00', '09:15', '09:30', '09:45', '10:00'] },
    { key: 'Daily', label: 'Daily', short: 'last 24h', scale: 1 / 7, svc: 22, ep: 318, prev: 'vs previous day', axis: ['10:00', '16:00', '22:00', '04:00', '10:00'] },
    { key: 'Weekly', label: 'Weekly', short: 'last 7d', scale: 1, svc: C.services.length, ep: C.endpoints.length, prev: 'vs previous week', axis: ['Mon 21', 'Wed', 'Fri', 'Sun', 'Today'] },
    { key: 'Monthly', label: 'Monthly', short: 'last 30d', scale: 30 / 7, svc: C.services.length, ep: C.endpoints.length, prev: 'vs previous month', axis: ['29 Aug', '5 Sep', '12 Sep', '19 Sep', 'Today'] },
  ];
  const epSorted = C.endpoints.slice().sort((a, b) => b.hits - a.hits);
  base.ENDPOINTS = epSorted.map((e, i) => ({ id: 'E' + i, endpoint_id: e.endpoint_id, type: e.type === 'vm' ? 'VM' : e.type, host: e.host, ip: e.ip, user: e.owner_kind === 'person' && e.identity_source ? e.user : null, dept: e.department || (e.owner_kind === 'service' ? 'Service accounts' : 'Unmapped'),
    svcCount: e.services, daily: e.hits, firstSeen: dDay(e.first_seen), ephemeral: e.ephemeral, lastMin: Math.max(0, Math.floor((NOW - e.last_seen) / 60)), sensor: e.sensor }));
  base.FLEET = base.ENDPOINTS.map((x, i) => { const e = epSorted[i]; return { ...x, noAgent: e.agent_state === 'no_agent', recordOnly: e.agent_state === 'record_only', offline: e.agent_state === 'offline', bundleV: e.agent_state === 'no_agent' ? null : 42,
    allowed: e.allowed, blocked: e.blocked, recorded: e.recorded, checkin: e.agent_state === 'no_agent' ? '—' : e.agent_state === 'offline' ? ago(NOW - e.last_heartbeat) + ' ago' : Math.max(1, Math.round((NOW - e.last_heartbeat) / 60)) + ' min ago',
    role: e.agent_state === 'no_agent' ? null : cid(e.group_id), tools: e.tools.filter(t => TOOLNAME[t] && t !== 'claude-desktop'), devId: e.device_id ? 'dev-' + e.device_id.slice(0, 8) : 'dev-none', behind: e.behind, behindTool: e.behind_tool }; });
  const PROV_SURF = {};
  base.PROVIDERS = C.providers.map(p => ({ id: p.id, name: p.name, svc: svcIdx(p.status_from), eps: p.endpoints, tools: p.tools.map((t, i) => { const s = C.services.find(x => x.service_id === t); return [s.ai_service, p.surfaces[i], s.endpoints, s.hits]; }) }));
  // MCP & Skills
  const disc = {};
  for (const m of C.mcp_discovered) { const k = m.name; disc[k] = disc[k] || { name: k, kind: 'MCP', tools: new Set(), eps: 0, last: 0, flags: m.flags, risk: m.risk_tier }; disc[k].tools.add(TOOLNAME[m.tool] || m.tool); disc[k].eps++; disc[k].last = Math.max(disc[k].last, m.last_seen); }
  for (const s of C.skills) { const k = s.name; disc[k] = disc[k] || { name: k, kind: 'Skill', tools: new Set(), eps: 0, last: 0, source: s.source, flags: s.flags }; disc[k].tools.add(TOOLNAME[s.tool] || s.tool); disc[k].eps++; disc[k].last = Math.max(disc[k].last, s.last_seen); }
  base.MCP_DISC = Object.values(disc).sort((a, b) => (a.kind === b.kind ? b.eps - a.eps : a.kind === 'MCP' ? -1 : 1)).map(d => ({ name: d.name, kind: d.kind, tools: [...d.tools].join(' · '), eps: d.eps, last: ago(NOW - d.last) + ' ago',
    ...(d.kind === 'Skill' && d.source === 'builtin' ? { reviewed: true } : {}), ...(d.name === 'gmail-mcp' ? { risk: 'high · reaches customer email from a Treasury laptop' } : {}), ...(d.name === 'web-scraper' ? { risk: 'network-egress flag' } : {}), ...(d.name === 'filesystem' ? { risk: 'blocked at the Bridge but still configured' } : {}) }));
  const epLine = h => { const e = C.endpoints.find(x => x.host === h); return (e.user ? e.user + ' · ' : '') + h + ' · ' + e.ip; };
  const cfgPath = t => t === 'claude-desktop' ? '~/Library/Application Support/Claude/claude_desktop_config.json' : t === 'codex-cli' ? '~/.codex/config.toml' : t === 'gemini-cli' ? '~/.gemini/settings.json' : '~/.claude.json';
  base.MCP_EPS = ['LT-SG-2231', 'LT-SG-5120', 'LT-VN-0419', 'LT-SG-3391'].map(h => { const e = C.endpoints.find(x => x.host === h); return { label: epLine(h), type: e.type + ' · ' + e.os,
    items: [...C.mcp_discovered.filter(m => m.host === h).map(m => [m.name, 'MCP', TOOLNAME[m.tool] || m.tool, cfgPath(m.tool)]), ...C.skills.filter(s => s.endpoint_id === e.endpoint_id).map(s => [s.name, 'Skill', TOOLNAME[s.tool] || s.tool, s.source === 'builtin' ? 'built-in' : '~/.claude/skills/' + s.name])] }; });

  // ---- Control ----
  base.CUE_ROLES = C.groups.map(g => g.console_id);
  base.ROLE_NAMES = { 'bank-baseline': 'Bank baseline (all Claude Code)', ...Object.fromEntries(C.groups.map(g => [g.console_id, g.name])) };
  base.ROLES0 = C.groups.map(g => ({ id: g.console_id, api_id: g.id, name: g.name, desc: g.desc, owner: g.owner, memberList: [], review: g.recert_due ? dDate(g.recert_due) + ' · due in 14 days' : dDate(NOW + (60 + (g.member_count % 90)) * 86400), overdue: false, grants: [], active: true }));
  const bridgeStatus = b => b.status === 'approved' ? 'Onboarded' : b.status === 'blocked' ? 'Rejected' : b.findings && b.findings.scan_complete ? 'Awaiting approval' : 'Scanning';
  base.BRIDGE0 = C.bridge.map(b => ({ id: b.id, name: b.name, source: b.source, scan: (b.findings.high ? b.findings.high + ' high · ' : b.findings.medium ? b.findings.medium + ' medium · ' : 'passed · ') + b.findings.summary + ' · risk ' + b.risk_score, lvl: b.risk_tier === 'high' ? 'high' : b.risk_tier === 'medium' ? 'medium' : 'ok',
    tools: (b.capabilities.tools || []).join(' · ') + (b.capabilities.disabled_tools ? ' · (' + b.capabilities.disabled_tools.join(', ') + ' disabled)' : ''), status: bridgeStatus(b),
    date: b.status === 'scanning' ? 'requested ' + ago(NOW - b.created_at) + ' ago' : dDate(b.created_at), by: b.status === 'scanning' ? 'requested by ' + b.requested_by + ' · “' + b.request_reason + '”' : b.approved_by }));
  base.ACCESS0 = Object.fromEntries(C.bridge.filter(b => b.status === 'approved').map(b => [b.name, Object.fromEntries(C.groups.map(g => [g.console_id, g.mcp_allow.includes(b.name) ? 1 : 0]))]));
  base.MCP_CATALOG = C.bridge.map(b => [b.name, (b.capabilities.tools || []).join(' · '), null]);
  base.MCP0 = [{ id: 'm-confluence', bridge_id: 'mcp_confluence', name: 'confluence', source: C.bridge.find(b => b.name === 'confluence').source, desc: 'Reads Confluence pages and searches spaces the user can access. Read-only.', tools: [['search', 0], ['get_page', 0]], user: 'Rahul Iyer', role: 'payments-eng', host: 'LT-SG-2231', tool: 'claude-code', age: '3h 0m', blocked: 2, reason: 'Read runbooks while debugging settlement jobs.' }];
  const orig = (sec, value, c, base) => {
    const inhFrom = base && ((sec === 'egress' && base.egress_allow.includes(value)) || (sec === 'dlp' && base.dlp_rules.includes(value)));
    return inhFrom ? { inh: 'Bank baseline', origin: 'role', since: 'v1', ref: 'Bank baseline v' + base.version } : sec === 'mcp' ? { origin: 'mcp', since: 'v' + c.version, ref: 'approved in MCP Bridge' } : { origin: 'role', since: 'v' + Math.max(1, c.version - 1), ref: c.updated_by };
  };
  const DLPD = Object.fromEntries(C.dlp_rules.map(d => [d.id, d.label + ' · Enforce']));
  const envOf = (c, extraDlp = []) => { const bc = c.base_cue_id ? C.cues.find(x => x.id === c.base_cue_id) : null;
    return [...c.egress_allow.map(v => ({ sec: 'egress', value: v, detail: v.startsWith('api.') || v.startsWith('generativelanguage') ? 'model API' : v.includes('registry') || v === 'pypi.org' ? 'package registry' : v.includes('github') ? 'source hosting' : 'internal service', b: null, ...orig('egress', v, c, bc) })),
      ...c.mcp_servers.map(v => ({ sec: 'mcp', value: v, detail: (C.bridge.find(b => b.name === v).capabilities.tools || []).join(' · '), b: null, ...orig('mcp', v, c, bc) })),
      ...[...c.dlp_rules, ...extraDlp].map(v => ({ sec: 'dlp', value: v, detail: DLPD[v], b: null, ...(extraDlp.includes(v) ? { origin: 'role', since: 'v' + (c.version + 1), ref: c.draft ? c.draft.by + ' · draft' : '' } : orig('dlp', v, c, bc)) })),
      ...(c.internal_tools || []).map(v => ({ sec: 'perm', value: v, detail: 'internal skill allowed in the sandbox', b: null, origin: 'role', since: 'v' + c.version, ref: c.updated_by }))]; };
  const hist = c => c.versions.map(v => ({ v: v[0], date: dDate(v[1]), by: v[2], change: v[3], via: /MCP/.test(v[3]) ? 'MCP approval' : v[2] === 'aegis' ? 'shipped default' : 'composed here' }));
  base.CUES0 = [];
  for (const c of C.cues) {
    base.CUES0.push({ id: c.id, name: c.name, tool: c.tool, role: c.console_role, v: c.version, state: 'signed', pub: dDate(c.updated_at), by: c.updated_by, how: c.base_cue_id ? 'composed here · inherits Bank baseline' : 'composed here', env: envOf(c), hist: hist(c), fixedCounts: c.id === 'cue_bank_baseline' ? { running: c.endpoints_current, older: 0 } : undefined });
    if (c.draft) base.CUES0.push({ id: c.id.replace(/_v\d+$/, '') + '_v' + c.draft.version + '_draft', draftOf: c.id, name: c.name, tool: c.tool, role: c.console_role, v: c.draft.version, state: 'draft', pub: 'draft · ' + ago(NOW - c.draft.at) + ' ago', by: c.draft.by, how: 'draft · ' + c.draft.note, env: envOf(c, c.draft.add_dlp), hist: [{ v: c.draft.version, date: 'draft', by: c.draft.by, change: '+ DLP ' + c.draft.add_dlp.join(', '), via: 'draft' }, ...hist(c)], fixedCounts: { running: 0, older: 0 } });
  }
  const famHits = id => C.detections.filter(d => d.rule_id === id).length;
  base.POLICIES = [...C.dlp_rules.map(d => ({ name: d.id, rule: d.detail, mode: 'Enforce', scope: d.scope, hits: d.state === 'draft' ? '— (draft)' : String(famHits({ 'dlp-card-pan': 'CARD-PAN', 'dlp-nric': 'PII-NRIC', 'dlp-secrets': 'SECRET-IN-PROMPT', 'dlp-swift-mt': 'SWIFT-MSG', 'dlp-source-archive': 'EXFIL' }[d.id])) })),
    { name: 'block-prohibited-ai', rule: 'Deny requests to services labelled Prohibited in Discover (DeepSeek, Kimi, Qwen Chat)', mode: 'Enforce', scope: 'all endpoints', hits: String(famHits('PROHIBITED-SERVICE')) }];
  base.PROHIBITED_HOSTS = { 'api.deepseek.com': 'DeepSeek', 'chat.deepseek.com': 'DeepSeek', 'kimi.moonshot.cn': 'Kimi', 'chat.qwen.ai': 'Qwen Chat' };

  // ---- Protect: detections ----
  base.DET_GROUPS = C.groups.map(g => g.name);
  base.DET_RULES = C.detection_families.map(f => [f.rule_id, f.label, f.severity, f.owasp || '—', f.signal]);
  base.RULE_DESC = Object.fromEntries(C.detection_families.map(f => [f.rule_id, f.description]));
  const detHosts = [...new Set(C.detections.map(d => d.host))];
  base.DET_EPS = detHosts.map(h => { const e = C.endpoints.find(x => x.host === h); return [h, e.user || '—', e.owner_kind, e.type === 'vm' ? 1 : 0, e.group_id ? C.groups.findIndex(g => g.id === e.group_id) : -1, cid(e.group_id)]; });
  const ruleIdx = id => C.detection_families.findIndex(f => f.rule_id === id);
  base.DET_ROWS = C.detections.map(d => [d.detection_id, d.session_id, detHosts.indexOf(d.host), rawTs(d.ts), ruleIdx(d.rule_id), d.disposition[0]]);
  base.DET_EVID = Object.fromEntries(C.detections.filter(d => d.evidence.type === 'undisclosed_action').map(d => [d.session_id, [d.evidence.undisclosed_action.declared, d.evidence.undisclosed_action.observed, d.detection_id.slice(-12).toLowerCase(), rawTs(d.ts + 30)]]));
  base.DET_EVIDENCE = Object.fromEntries(C.detections.map(d => { const e = d.evidence; return [d.detection_id, { type: e.type, teaser: d.teaser,
    content: e.sensitive_content ? { path: e.sensitive_content.path, basis: e.sensitive_content.basis, pat: e.sensitive_content.pattern, snippet: e.sensitive_content.snippet_redacted } : null,
    exfil: e.exfil ? { dest: e.exfil.destination, bytes: (e.exfil.bytes / 1048576).toFixed(1) + ' MB', cls: e.exfil.classification } : null,
    undis: e.undisclosed_action ? { declared: e.undisclosed_action.declared, observed: e.undisclosed_action.observed, undeclared: e.undisclosed_action.undeclared, declaredList: e.undisclosed_action.declared_list, observedExtra: e.undisclosed_action.observed_extra } : null,
    signature: d.detection_id === 'det_01JA4K9PAN1' ? 'aegis-smb-2026-09 · MEUCIQ9f3k…' : null }]; }));
  // runtime blast radius, grouped by (user, host)
  const radius = [];
  for (const b of C.blast.slice().sort((a, b) => b.ts - a.ts)) {
    const e = C.endpoints.find(x => x.host === b.host); const c = C.cues.find(x => x.id === b.cue_id);
    const cueRef = c ? c.tool + '/' + c.console_role + '@v' + c.version : 'no CUE · host';
    let r = radius.find(x => x.hostKey === b.host);
    if (!r) { r = { id: 'r-' + b.host.toLowerCase(), hostKey: b.host, user: b.owner, ep: b.host + ' · ' + e.ip, cue: cueRef, total: 0, last: when(b.ts), runs: [] }; radius.push(r); }
    r.total++;
    r.runs.push({ id: b.execution_id, detection_id: b.detection_id, when: when(b.ts), mcp: b.mcp, sbx: b.sandbox, cred: b.credential_detail, credShort: 'creds · ' + b.credential, action: b.action, data: b.data, dlp: b.dlp_label, dlpLong: b.dlp_long });
  }
  base.RADIUS = radius.map(({ hostKey, ...r }) => r);
  base.RAD_STATS = { runs: C.blast.length, users: new Set(C.blast.map(b => b.owner)).size, cues: new Set(C.blast.map(b => b.cue_name)).size, cuesLive: C.cues.length, sandboxes: new Set(C.blast.filter(b => b.sandbox.startsWith('sbx')).map(b => b.mcp)).size };

  // ---- Protect: sessions ----
  const sEv = (list, base0) => list.map(a => ({ c: a.cat === 'agent' ? 'agent' : a.cat, k: a.kind, l: a.label, d: a.detail || '', v: a.verdict === 'block' ? 'blocked' : a.verdict === 'stopped' ? 'stopped' : 'ok', s: a.severity || '', t: base0 + a.offset + OFF }));
  const hero = C.sessions.activity.sbx_7c21e9a04b3f; const heroTs = C.detections.find(d => d.detection_id === 'det_01JA4K9PAN1').ts;
  const cleanRow = C.sessions.rows.find(s => s.outcome === 'clean' && s.host === 'LT-SG-2231');
  const stopRow = C.sessions.rows.find(s => s.outcome === 'stopped' && s.owner === 'Marcus Lee');
  const mkEv = (t0, rows) => rows.map((r, i) => ({ c: r[0], k: r[1], l: r[2], d: r[3] || '', v: r[4] || 'ok', s: r[5] || '', t: t0 + OFF + i * 17 }));
  base.SESSIONS = {
    detected: { session: 'sbx_7c21e9a04b3f', origin: hero.origin, boot: hero.boot, ev: sEv(hero.activity, heroTs) },
    clean: { session: cleanRow.sid, origin: { source: 'sandbox', writable: true, profile: 'claude-code', workspace: '~/src/settlement-recon', identity: 'spiffe://' + M.domain + '/user/rahul.iyer', initial_prompt: cleanRow.initial_prompt }, boot: hero.boot,
      ev: mkEv(cleanRow.started, [['prompt', 'turn', cleanRow.initial_prompt, 'claude-sonnet-5'], ['file_read', 'read', 'recon/batch.py'], ['file_read', 'read', 'recon/parser.py'], ['file_write', 'write', 'tests/test_parser.py'], ['shell', 'exec', 'pytest -q tests/test_parser.py'], ['egress', 'connect', 'api.anthropic.com', 'on allow-list'], ['egress', 'connect', 'pypi.org', 'on allow-list'], ['prompt', 'turn', 'summarise the change', 'claude-sonnet-5'], ['git', 'commit', 'git commit -m "test: batch parser"']]) },
    stopped: { session: stopRow.sid, origin: { source: 'sandbox', writable: true, profile: 'claude-code', workspace: '~/src/mobile-app', identity: 'spiffe://' + M.domain + '/user/marcus.lee', initial_prompt: 'migrate the mobile login screens to the new design system' }, boot: hero.boot,
      ev: [...mkEv(stopRow.started, [['prompt', 'turn', 'migrate the mobile login screens to the new design system', 'claude-sonnet-5'], ['file_read', 'read', 'app/screens/login/*.tsx'], ['file_write', 'write', 'app/screens/login/LoginForm.tsx'], ['prompt', 'turn', 'now the OTP screen', 'claude-sonnet-5'], ['file_write', 'write', 'app/screens/login/Otp.tsx'], ['prompt', 'turn', 'update all snapshots', 'claude-sonnet-5'], ['shell', 'exec', 'npm test -- -u']]), { c: 'prompt', k: 'turn', l: 'Budget hard-stop: USD 40.00 per user per 24h reached', d: 'claude-sonnet-5', v: 'stopped', s: '', t: stopRow.last_seen + OFF }] },
  };
  base.SESSION_LIST = C.sessions.rows.slice(0, 40).map(s => ({ id: s.sid, shape: s.outcome, host: s.host, owner: s.owner || '—', group: s.group_id ? G[s.group_id].name : 'unmapped', ts: s.started + OFF, fixed: { ev: s.actions + s.prompts + s.egress, det: s.detections, blk: s.denies } }));
  base.SESSION_TOTALS = C.sessions.totals;

  // ---- Usage ----
  const U = C.usage;
  base.USAGE_SUMMARY = { turns: U.summary.turns, users: U.summary.users, sessions: U.summary.sessions, cost: U.summary.cost_usd, tokens: U.summary.tokens };
  base.USAGE_GROUPS = U.by_group.map(g => { const us = U.by_user.filter(u => u.group_id === g.group_id); return { group: g.group_id ? G[g.group_id].name : 'Ungrouped', roleId: g.group_id ? cid(g.group_id) : 'ungrouped', devices: g.users, sessions: g.sessions, turns: us.reduce((a, u) => a + u.turns, 0), tokens: us.reduce((a, u) => a + u.tokens, 0), cost: g.cost, cap: g.cap_usd, warn: g.mode === 'warn', stops: g.stops }; });
  base.USAGE_USERS = U.by_user.slice(0, 10).map(u => ({ person: u.person.toLowerCase().replace(/\s+/g, '.'), turns: u.turns, sessions: u.sessions, input: u.input, output: u.output, cost: u.cost_usd }));
  base.USAGE_RATES = Object.fromEntries(U.by_model.map(m => [m.model, { wire: m.provider, input: m.rate_per_mtok.input, output: m.rate_per_mtok.output, cache: m.rate_per_mtok.cache_read }]));
  base.USAGE_MODEL_COST = Object.fromEntries(U.by_model.map(m => [m.model, m.cost_usd]));
  base.USAGE_MODEL_TOK = Object.fromEntries(U.by_model.map(m => [m.model, (m.input_tokens + m.output_tokens + m.cache_read_tokens) / U.summary.tokens]));
  base.USAGE_WIRES = { Anthropic: '#4F5BD5', Google: '#0B5A61', OpenAI: '#7c8896' };
  base.USAGE_MODEL_COLOR = { 'claude-sonnet-5': '#4F5BD5', 'gemini-2.5-pro': '#0B5A61', 'gpt-5': '#7c8896' };
  base.USAGE_RECENT = [
    { ts: NOW - 300 + OFF, person: 'rahul.iyer', model: 'claude-sonnet-5', cost: 0.1841, prompt: "find why yesterday's card settlement is off by SGD 1,240" },
    { ts: NOW - 900 + OFF, person: 'nur.aisyah', model: 'claude-sonnet-5', cost: 0.0932, prompt: 'add retry with backoff to the PayNow proxy lookup' },
    { ts: NOW - 1500 + OFF, person: 'jia.hui.ong', model: 'gemini-2.5-pro', cost: 0.2210, prompt: 'build the weekly dormant-account report from customer_360' },
    { ts: NOW - 2400 + OFF, person: 'marcus.lee', model: 'claude-sonnet-5', cost: 0.4120, prompt: 'migrate the mobile login screens to the new design system' },
  ];
  base.USAGE_STOPS = U.stops.map(s => ({ sid: s.sid.slice(4), person: s.person.toLowerCase().replace(/\s+/g, '.'), group: G[s.group_id].name, cap: '$' + s.cap_usd.toFixed(2), spendAt: '$' + s.spend_usd.toFixed(2), intended: s.stop_turn + 6 + (s.stop_turn % 9), stopTurn: s.stop_turn, when: dDay(s.ts) + ' · ' + hm(s.ts), scope: 'rolling 24h cap' }));
  base.USAGE_PERIOD = 7;

  // ---- text + clock + settings ----
  const pcap = C.sensors.discovery[0], zs = C.sensors.discovery[1];
  base.CLOCK = { nowMs: (NOW + OFF) * 1000, rawNowMs: (NOW + OFF) * 1000, today: dDate(NOW), stampHm: hm(NOW) };
  base.DEFAULT_WINDOW = 'Weekly';
  base.IMPORT_CUE = 'cue_contractors_v1';
  base.SESS_OPTIONS = [['clean', 'Clean run', 'Rahul Iyer · unit test for the batch parser'], ['detected', 'Card-data block', 'det_01JA4K9PAN1 · DLP + egress blocked'], ['stopped', 'Budget stop', 'Marcus Lee · USD 40 cap reached']];
  base.DATA_STATE = 'partial';
  base.TEXT = {
    org: M.org.name, footer: 'Demo data · fictional',
    freshness: `Data as of ${hm(M.data_as_of)} SGT · pcap reporting · sase_zscaler silent 2 h 40 m`,
    shadowDelta: (Math.round((C.services.filter(s => ['unapproved', 'prohibited', 'unlabelled'].includes(s.status)).reduce((a, s) => a + s.hits, 0) / 102110 - C.shadow_previous.shadow_hits / C.shadow_previous.hits) * 1000) / 10).toFixed(1) + ' pts vs previous week (5.4%)',
    sensors: [{ name: pcap.sensor, desc: pcap.description, endpoints: pcap.endpoints, services: pcap.services, requests: pcap.hits, lastSeen: '2 min ago', health: 'reporting', color: '#4F5BD5' },
      { name: zs.sensor, desc: 'Zscaler web logs for remote staff via webhook', endpoints: zs.endpoints, services: zs.services, requests: zs.hits, lastSeen: '2h 40m ago', health: 'not reporting', color: '#b42318' }],
    directory: { provider: 'Entra ID · ' + M.domain, mapped: C.sensors.directory.mapped_endpoints + ' of ' + C.sensors.directory.total_endpoints, synced: hm(C.sensors.directory.last_sync) },
    decisions: C.services.filter(s => s.reviewed_at).sort((a, b) => b.reviewed_at - a.reviewed_at).slice(0, 4).map(s => ({ name: s.ai_service, status: STATUS[s.status], reviewer: s.reviewed_by, date: dDay(s.reviewed_at) })),
    attnOrder: C.services.filter(s => s.status === 'unlabelled').sort((a, b) => a.first_seen < b.first_seen ? 1 : -1).map(s => s.ai_service),
    deviceDetail: { dlp: ['Card number in tool result', 'NRIC in pasted text', 'MT103 message in prompt'], notInCue: ['egress pastebin.com not listed', 'MCP server confluence not listed', 'egress api.perplexity.ai not listed'], recorded: 'Source archive in prompt', agentSvc: { 'claude-code': 'Claude Code', 'gemini-cli': 'Gemini CLI', 'codex-cli': 'Codex CLI' } },
    platformSandbox: { records: C.sensors.endpoint.find(x => x.sensor === 'aegis-sandbox').events.toLocaleString('en-US'), unauthorised: C.endpoints.reduce((a, e) => a + e.blocked, 0).toLocaleString('en-US'), vms: String(C.endpoints.filter(e => e.type === 'vm' && e.agent_state !== 'no_agent').length) },
    frameworks: ['MAS Technology Risk Management Guidelines', 'MAS Notice on Cyber Hygiene', 'PDPA', 'PCI DSS v4.0'],
    accessRows: Object.values(personas).map(p => [p.name, p.email, p.console || 'No console (developer · /me)', p.name === 'Tan Wei Ling' ? 'now' : 'today']).concat([['Kavitha Pillai', 'kavitha.pillai@' + M.domain, 'Security', 'yesterday']]),
  };
  base.HOME_FACTS = {
    journeyNext: 'Full containment',
    zscalerSilent: '2 h 40 m', contractorsRecert: '14 days', confluence: 'confluence',
    records_left_bank: 0,
    decisions: [
      { text: 'Approve or block confluence MCP for Engineering — Payments (requested by Rahul Iyer)', meta: 'MCP Bridge', go: 'bridge' },
      { text: 'Publish Payments CUE v4 (dlp-mask-query-results) drafted by Arjun Menon', meta: 'CUE draft', go: 'cues' },
      { text: 'Decide on Perplexity and Codex CLI (new, unlabelled; Codex CLI on 7 contractor laptops)', meta: 'Discover', go: 'services' },
    ],
  };

  // ---- persona overlays ----
  const overlays = {};
  for (const [login, p] of Object.entries(personas)) {
    const o = { HOME_KEY: p.home, PERSONA: login };
    if (p.overview_layout) o.DEFAULT_LAYOUT = p.overview_layout;
    if (p.evidence === 'redacted') {
      o.REDACTED = true;
      o.DET_EVIDENCE = Object.fromEntries(C.detections.map(d => [d.detection_id, { type: d.evidence.type, redacted: true, teaser: d.rule_label + ' · ' + d.target_type, content: null, exfil: null, undis: null, signature: null }]));
      o.SESSIONS = Object.fromEntries(Object.entries(base.SESSIONS).map(([k, s]) => [k, { ...s, origin: { ...s.origin, initial_prompt: null }, ev: s.ev.map(e => e.c === 'prompt' ? { ...e, l: '[prompt redacted for your role]', d: '' } : e.c === 'detection' ? { ...e, d: '' } : e) }]));
      o.RADIUS = base.RADIUS.map(r => ({ ...r, runs: r.runs.map(x => ({ ...x, action: '[redacted for your role]', dlpLong: x.dlp + ' · blocked (details redacted for your role)' })) }));
      o.USAGE_RECENT = base.USAGE_RECENT.map(u => ({ ...u, prompt: '[redacted for your role]' }));
    }
    overlays[login] = o;
  }
  return { base, personas: overlays };
}
