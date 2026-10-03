// Shapes API responses (RayShield Console API v2.1 + v2.2 + proposed /api/me/*) from canonical.json,
// applying the access-matrix level for the calling persona (read | redacted | self | deny).
// Used by scripts/build-tenant-fixtures.mjs (to write fixtures) and by src/server.js (live router),
// so fixtures on disk and live responses come from one code path.
import crypto from 'node:crypto';

export function makeApi(canonical, personas, matrix) {
  const C = canonical, M = C.meta, NOW = M.now;
  const G = Object.fromEntries(C.groups.map(g => [g.id, g]));
  const EP = Object.fromEntries(C.endpoints.map(e => [e.endpoint_id, e]));
  const EP_BY_DEV = Object.fromEntries(C.endpoints.filter(e => e.device_id).map(e => [e.device_id, e]));
  const EP_BY_HOST = Object.fromEntries(C.endpoints.map(e => [e.host, e]));
  const SVC = Object.fromEntries(C.services.map(s => [s.service_id, s]));
  const FAM = Object.fromEntries(C.detection_families.map(f => [f.rule_id, f]));
  const groupRef = gid => gid && G[gid] ? { id: gid, name: G[gid].name } : null;
  const OPS = matrix.operations;

  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const winHeaders = extra => ({ 'X-Window-From': String(M.window_from), 'X-Window-To': String(M.window_to), 'X-Data-As-Of': String(M.data_as_of), ...extra });
  const ok = (body, headers = {}) => ({ status: 200, headers, body });
  const reqId = seed => 'req_' + crypto.createHash('sha1').update(String(seed)).digest('base64url').slice(0, 8);
  const err = (status, code, error, seed) => ({ status, headers: {}, body: { error, code, request_id: reqId(seed || error) } });
  const forbidden = (persona, opId) => { const p = personas[persona]; return err(403, 'FORBIDDEN', `Role '${p ? p.role_claim : 'unknown'}' (${p ? p.name : persona}) cannot call ${opId}.`, persona + opId); };
  const notFound = what => err(404, 'NOT_FOUND', `No ${what} with that id.`, what);

  function level(persona, opId) { const op = OPS.find(o => o.operationId === opId); return op ? op.access[persona] || 'deny' : 'deny'; }

  // ---- live overlay (server passes demo state; fixtures use the seed state) ----
  function view(live = {}) {
    const services = C.services.map(s => live.serviceStatus && live.serviceStatus[s.service_id] ? { ...s, ...live.serviceStatus[s.service_id] } : s);
    const removed = new Set(live.removedBridge || []);
    const bridge = [...C.bridge, ...(live.newBridge || [])].filter(b => !removed.has(b.id)).map(b => live.bridge && live.bridge[b.id] ? { ...b, ...live.bridge[b.id] } : b);
    const cues = C.cues.map(c => c.id === 'cue_payments_v3' && live.payCueVersion === 4 ? { ...c, version: 4, dlp_rules: [...c.dlp_rules, 'dlp-mask-query-results'], own_dlp: ['dlp-mask-query-results'], updated_by: live.payCuePublishedBy || c.updated_by, updated_at: live.payCuePublishedAt || NOW, draft: null, versions: [[4, live.payCuePublishedAt || NOW, live.payCuePublishedBy || 'Priscilla Goh', '+ DLP dlp-mask-query-results'], ...c.versions] } : c);
    const deleted = new Set(live.deletedCues || []);
    const allCues = [...cues, ...(live.createdCues || [])].filter(c => !deleted.has(c.id)).map(c => live.cueEdits && live.cueEdits[c.id] ? { ...c, ...live.cueEdits[c.id] } : c);
    const detections = [...(live.extraDetections || []), ...C.detections];
    const groups = [...C.groups, ...(live.apiGroups || [])].map(g => {
      let x = live.groupPolicy && live.groupPolicy[g.id] ? { ...g, ...live.groupPolicy[g.id] } : g;
      if (live.mcpGrants && live.mcpGrants[g.id]) x = { ...x, _grants: live.mcpGrants[g.id] };
      const cid = live.groupCue && live.groupCue[g.id];
      if (cid) { const c = allCues.find(k => k.id === cid); x = { ...x, assigned_cue_id: cid, assigned_cue_name: c ? c.name + ' v' + c.version : cid }; }
      return x;
    });
    return { services, bridge, cues: allCues, detections, groups };
  }

  // ---- per-endpoint service mix (deterministic) ----
  const TOOL_SVC = { 'claude-code': 'claude-code', 'gemini-cli': 'gemini-cli', 'codex-cli': 'codex-cli', 'claude-desktop': 'claude-personal' };
  function servicesOf(e) {
    const approved = C.services.filter(s => s.status === 'approved' && !['claude-code', 'gemini-cli'].includes(s.service_id));
    const ids = new Set(e.tools.map(t => TOOL_SVC[t]).filter(Boolean));
    let h = hash(e.host);
    while (ids.size < e.services) { ids.add(approved[h % approved.length].service_id); h = Math.imul(h ^ 0x9e37, 2654435761) >>> 0; }
    const arr = [...ids].slice(0, Math.max(1, e.services)); const w = arr.map((_, i) => arr.length - i); const sw = w.reduce((a, b) => a + b, 0);
    let acc = 0; return arr.map((id, i) => { const hits = i === arr.length - 1 ? e.hits - acc : Math.floor(e.hits * w[i] / sw); acc += hits; return { service_id: id, hits }; });
  }

  // ---- shapes ----
  const serviceShape = s => ({ ai_service: s.ai_service, category: s.category, icon: null, separability: s.separability, confidence: s.confidence, hits: s.hits, bytes: s.bytes, users: s.users, risk_score: s.risk_score, jurisdiction: s.jurisdiction, ever_agentic: /agent/i.test(s.category), sandbox_candidate: /agent/i.test(s.category), agent_sdks: null, collector_count: 2, first_seen: s.first_seen, last_seen: s.last_seen, personal_account: s.personal_account, oauth_scopes: null, service_id: s.service_id, vendor: s.vendor, embedded_in: s.embedded_in, status: s.status, reviewed_by: s.reviewed_by, reviewed_at: s.reviewed_at, endpoints: s.endpoints, is_new: s.is_new });
  const discEpShape = e => ({ endpoint: e.ip, host: e.host, hits: e.hits, bytes: e.bytes, services: e.services, endpoint_id: e.endpoint_id, device_id: e.device_id, type: e.type, ephemeral: e.ephemeral, user: e.identity_source ? e.user : null, department: e.identity_source ? e.department : null, identity_source: e.identity_source, sensor: e.sensor, first_seen: e.first_seen, last_seen: e.last_seen });
  const deviceShape = e => ({ id: e.device_id, device_name: e.host, status: e.agent_state === 'offline' ? 'offline' : 'active', health_score: e.agent_state === 'enforcing' ? 90 + (hash(e.host) % 9) : e.agent_state === 'record_only' ? 71 : 40, risk_level: e.blocked > 20 ? 'medium' : 'low', blocks_24h: Math.round(e.blocked / 7), last_heartbeat: e.last_heartbeat, endpoint_id: e.endpoint_id, ip: e.ip, type: e.type, owner: e.user, owner_kind: e.owner_kind, department: e.department, group: groupRef(e.group_id), agent_state: e.agent_state, agent_version: e.agent_version, tools: e.tools, allowed: e.allowed, blocked: e.blocked, recorded: e.recorded });
  const detRowShape = (d, lv) => ({ detection_id: d.detection_id, ts: d.ts, rule_id: d.rule_id, rule_label: d.rule_label, severity: d.severity, disposition: d.disposition, device_id: d.device_id, host: d.host, owner: d.owner, owner_kind: d.owner_kind, department: d.department, group: groupRef(d.group_id), session_id: d.session_id, teaser: lv === 'redacted' ? `${d.rule_label} · ${d.target_type}` : d.teaser });
  function detDetail(d, lv) {
    const f = FAM[d.rule_id]; const redact = lv === 'redacted';
    const evd = redact ? { type: d.evidence.type, decoded_command: null, sensitive_content: null, exfil: null, egress_spike: null, persistence: null, undisclosed_action: null } : d.evidence;
    const chain = [...(d.chain_extra || []).filter(c => c.dt < 0).map(c => ({ ts: d.ts + c.dt, label: c.label, detail: redact ? null : c.label, is_current: false, is_detection: false })),
      { ts: d.ts, label: d.rule_label, detail: redact ? null : d.teaser, is_current: true, is_detection: true, severity: d.severity, disposition: d.disposition },
      ...(d.chain_extra || []).filter(c => c.dt > 0).map(c => ({ ts: d.ts + c.dt, label: c.label, detail: redact ? null : c.label, is_current: false, is_detection: false }))];
    const h = hash(d.detection_id);
    const out = { ...detRowShape(d, lv), description: f.description, owasp: f.owasp, signal: f.signal, classification: d.evidence.type === 'exfil' ? 'transfer' : 'regulated data', backend: 'aegis-engine 0.9.6', evidence: evd, chain,
      signature: { alg: 'ed25519', key_id: 'aegis-smb-2026-09', value: 'MEUCIQ' + (h.toString(36) + (h * 7919 >>> 0).toString(36)).slice(0, 12) + '…', signed_at: d.ts + 1, verify_hint: 'aegis verify ' + d.detection_id } };
    return out;
  }
  const sessionShape = s => ({ sid: s.sid, name: s.name, egress: s.egress, actions: s.actions, prompts: s.prompts, dlp: s.dlp, rules: s.rules, denies: s.denies, started: s.started, last_seen: s.last_seen, device_id: s.device_id, host: s.host, owner: s.owner, department: s.department, group: groupRef(s.group_id), tool: s.tool, detections: s.detections, outcome: s.outcome });
  function sessionActivity(s, lv, detections) {
    const redact = lv === 'redacted';
    const hero = C.sessions.activity[s.sid];
    const header = { device_id: s.device_id, host: s.host, owner: s.owner, department: s.department, group: groupRef(s.group_id), tool: s.tool, outcome: s.outcome, started: s.started, last_seen: s.last_seen };
    let origin, boot, activity;
    if (hero) {
      const base = detections.find(d => d.session_id === s.sid).ts;
      origin = { ...hero.origin }; boot = hero.boot;
      activity = hero.activity.map(a => ({ cat: a.cat, kind: a.kind, label: a.label, detail: a.detail, count: a.count, verdict: a.verdict, severity: a.severity, first_ts: base + a.offset, last_ts: base + a.offset, rule_id: a.rule_id, reason: a.reason, owasp: a.owasp }));
    } else {
      const e = EP_BY_HOST[s.host]; const who = (e.user || 'svc').toLowerCase().replace(/[^a-z]+/g, '.');
      origin = { source: 'sandbox', writable: true, profile: s.tool || 'agent', workspace: '~/src/' + s.name.split(' · ')[1], identity: `spiffe://${M.domain}/${e.owner_kind === 'service' ? 'service' : 'user'}/${who}`, initial_prompt: s.initial_prompt || (s.outcome === 'stopped' ? 'refactor the batch parser and regenerate the tests' : 'fix the failing build in ' + s.name.split(' · ')[1]) };
      boot = { count: 10, items: [{ label: 'egress allow', count: 5 }, { label: 'mcps', count: 2 }, { label: 'dlp rules', count: 3 }] };
      activity = [{ cat: 'prompt', kind: 'turn', label: origin.initial_prompt, detail: 'model turn', count: 1, verdict: 'allow', severity: null, first_ts: s.started + 5, last_ts: s.started + 5, rule_id: null, reason: null, owasp: null },
        { cat: 'file_read', kind: 'read', label: 'Read files under ./src', detail: null, count: 4, verdict: 'allow', severity: null, first_ts: s.started + 40, last_ts: s.started + 90, rule_id: null, reason: null, owasp: null },
        ...detections.filter(d => d.session_id === s.sid).sort((a, b) => a.ts - b.ts).map(d => ({ cat: 'detection', kind: d.rule_id, label: d.rule_label, detail: d.teaser, count: 1, verdict: d.disposition === 'recorded' ? 'record' : 'block', severity: d.severity, first_ts: d.ts, last_ts: d.ts, rule_id: d.rule_id, reason: d.teaser, owasp: FAM[d.rule_id].owasp })),
        ...(s.outcome === 'stopped' ? [{ cat: 'stopped', kind: 'budget', label: 'Budget hard-stop reached', detail: null, count: 1, verdict: 'stopped', severity: null, first_ts: s.last_seen, last_ts: s.last_seen, rule_id: null, reason: 'per-user 24h cap', owasp: null }] : [])];
    }
    if (redact) { origin = { ...origin, initial_prompt: null }; activity = activity.map(a => a.cat === 'prompt' ? { ...a, detail: null } : a); }
    return { session: s.sid, header, origin, boot, activity };
  }
  const bridgeShape = (b, groups) => ({ id: b.id, name: b.name, source: b.source, kind: b.kind, status: b.status, risk_score: b.risk_score, risk_tier: b.risk_tier, capabilities: b.capabilities, findings: b.findings, approved_by: b.approved_by, approved_reason: b.approved_reason, groups_with_access: groups.filter(g => g.mcp_allow.includes(b.name)).map(g => ({ ...groupRef(g.id), access_expires_at: expIso(g, b.name) })), created_at: b.created_at, ...(b.suspended ? { suspended: true, suspended_by: b.suspended_by, suspended_reason: b.suspended_reason || null } : {}) });
  const expIso = (g, n) => { const x = (g._grants || {})[n]; return x && x.expires_at ? new Date(x.expires_at).toISOString() : null; };
  const cueField = (value, inheritedFrom) => ({ value, inherited: !!inheritedFrom, source: inheritedFrom || null });
  function cueDetail(c, cues, draft) {
    const base = c.base_cue_id ? cues.find(x => x.id === c.base_cue_id) : null;
    const baseName = base ? base.name : null;
    const inh = (list, baseList) => list.map(v => cueField(v, base && baseList.includes(v) ? baseName : null));
    const dlp = draft ? [...c.dlp_rules, ...c.draft.add_dlp] : c.dlp_rules;
    return { id: draft ? c.id.replace(/_v\d+$/, '') + '_v' + c.draft.version + '_draft' : c.id, name: c.name, tool: c.tool, scope: c.scope, scope_ref: c.scope_ref, base_cue_id: c.base_cue_id, version: draft ? c.draft.version : c.version, state: draft ? 'draft' : c.state,
      egress_allow: inh(c.egress_allow, base ? base.egress_allow : []), mcp_servers: c.mcp_servers.map(v => cueField(v, null)), dlp_rules: inh(dlp, base ? base.dlp_rules : []), internal_tools: (c.internal_tools || []).map(v => cueField(v, null)) };
  }
  const cueSummary = (c, draft) => ({ id: draft ? c.id.replace(/_v\d+$/, '') + '_v' + c.draft.version + '_draft' : c.id, name: c.name, tool: c.tool, scope: c.scope, scope_ref: c.scope_ref, base_cue_id: c.base_cue_id, latest_version: draft ? c.draft.version : c.version, endpoints_current: draft ? 0 : c.endpoints_current, endpoints_on_older: draft ? 0 : c.endpoints_on_older, state: draft ? 'draft' : c.state, updated_by: draft ? c.draft.by : c.updated_by, updated_at: draft ? c.draft.at : c.updated_at });
  const groupShape = g => ({ id: g.id, name: g.name, member_count: g.member_count, assigned_cue_id: g.assigned_cue_id, assigned_cue_name: g.assigned_cue_name, recert_due: g.recert_due, mcp_policy_id: 'mcpp_' + g.id.slice(4) });
  const mcpPolicy = g => ({ group_id: g.id, allow: g.mcp_allow.map(n => (C.bridge.find(b => b.name === n) || {}).id || n), deny: g.mcp_deny.map(n => (C.bridge.find(b => b.name === n) || {}).id || n), updated_by: g.policy_updated_by || 'Tan Wei Ling', updated_at: g.policy_updated_at || NOW - 9 * 86400, expires: Object.fromEntries(g.mcp_allow.filter(n => expIso(g, n)).map(n => [(C.bridge.find(b => b.name === n) || {}).id || n, expIso(g, n)])) });
  const blastRoot = b => ({ execution_id: b.execution_id, ts: b.ts, owner: b.owner, host: b.host, cue_name: b.cue_name, tool: b.tool, worst_outcome: b.worst_outcome, dlp_label: b.dlp_label, node_count: b.node_count });

  // ---- self scope ----
  const personaName = p => personas[p] && personas[p].name;
  const myEps = p => C.endpoints.filter(e => e.user === personaName(p));
  const isMine = (p, e) => !!e && e.user === personaName(p);

  // ---- fix hints (developer view) ----
  const FIX = {
    'CARD-PAN': 'Card numbers were in the data sent to the model, so DLP stopped it before it left your laptop. Query aggregates instead of raw rows, or wait for Payments CUE v4, which masks these columns.',
    'PII-NRIC': 'NRIC numbers were in the context, so DLP blocked the prompt. Use synthetic fixtures (make fixtures-synthetic) or masked views.',
    'SECRET-IN-PROMPT': 'A credential was in a file or prompt sent to the model. Use the Aegis Bridge vault connection instead of local credentials.',
    'SENSITIVE-ACCESS': 'The agent read a credential file. Keep secrets out of the workspace; Aegis mounts only the project directory.',
  };

  function paginate(list, limit = 50) { const page = list.slice(0, limit); const h = { 'X-Total-Count': String(list.length) }; if (list.length > limit) h['X-Next-Cursor'] = Buffer.from('o:' + limit).toString('base64url'); return { page, h }; }

  // ---- handlers --------------------------------------------------------------------------------
  // handle(persona, opId, params, live) → { status, headers, body }
  function handle(persona, opId, params = {}, live = {}) {
    const lv = level(persona, opId);
    if (lv === 'deny') return forbidden(persona, opId);
    const V = view(live);
    const self = lv === 'self';
    const mine = myEps(persona);
    const mineIds = new Set(mine.map(e => e.endpoint_id));
    const p = personas[persona];
    switch (opId) {
      case 'getMe': return ok({ id: 'usr_' + persona, name: p.name, email: p.email, role: p.role_claim, org: { id: M.org.id, name: M.org.name }, title: p.title, console_role: p.console, data_scope: p.data_scope });
      case 'getHome': {
        const svcs = V.services, un = svcs.filter(s => s.status === 'unlabelled');
        const crit = V.detections.filter(d => d.severity === 'critical');
        const attention = [
          { kind: 'protect', severity: 'critical', text: 'Card data blocked on LT-SG-2231 · escalated (det_01JA4K9PAN1)', meta: 'Card number (PAN) in agent context', ts: NOW - 7200, link: { screen: 'detection', params: { detection_id: 'det_01JA4K9PAN1' } } },
          { kind: 'discover', severity: 'critical', text: 'Activity on a prohibited service: DeepSeek on 6 Treasury endpoints', meta: '6 endpoints', ts: NOW - 5400, link: { screen: 'service', params: { service_id: 'deepseek' } } },
          { kind: 'discover', severity: 'warning', text: 'New AI service detected: Perplexity · no governance status yet', meta: '4 endpoints', ts: svcs.find(s => s.service_id === 'perplexity').first_seen, link: { screen: 'service', params: { service_id: 'perplexity' } } },
          { kind: 'discover', severity: 'warning', text: 'Unonboarded MCP server gmail-mcp on LT-SG-5120 (Treasury)', meta: 'risk high', ts: NOW - 2 * 86400, link: { screen: 'endpoint', params: { endpoint_id: 'ep_LT-SG-5120' } } },
          { kind: 'system', severity: 'warning', text: 'Sensor sase_zscaler has sent no data for 2 h 40 m', meta: null, ts: NOW - 9600, link: { screen: 'sensors', params: {} } },
          { kind: 'protect', severity: 'warning', text: '9 agents offline for more than 10 minutes', meta: '9 endpoints', ts: NOW - 3600, link: { screen: 'fleet', params: { agent_state: 'offline' } } },
        ];
        return ok({ planes: [
          { name: 'Discover', rows: [{ key: 'services_detected', label: 'AI services detected', value: svcs.length, total: null, link: { screen: 'services', params: {} } }, { key: 'services_unlabelled', label: 'Awaiting a governance decision', value: un.length, total: null, link: { screen: 'services', params: { status: 'unlabelled' } } }, { key: 'endpoints_using_ai', label: 'Endpoints using AI', value: C.endpoints.length, total: null, link: { screen: 'endpoints', params: {} } }] },
          { name: 'Protect', rows: [{ key: 'agents_enforcing', label: 'Endpoints with an enforcing agent', value: C.endpoints.filter(e => e.agent_state === 'enforcing').length, total: C.endpoints.length, link: { screen: 'fleet', params: { agent_state: 'enforcing' } } }, { key: 'detections', label: 'Detections', value: V.detections.length, total: null, link: { screen: 'detections', params: {} } }, { key: 'detections_escalated', label: 'Escalated to a human', value: V.detections.filter(d => d.disposition === 'escalated').length, total: null, link: { screen: 'detections', params: { disposition: 'escalated' } } }, { key: 'critical_contained', label: 'Critical detections contained', value: crit.filter(d => d.disposition !== 'recorded').length, total: crit.length, link: { screen: 'detections', params: { severity: 'critical' } } }] },
        ], attention }, winHeaders());
      }
      case 'getDiscoverySummary': {
        const svcs = self ? V.services.filter(s => mine.some(e => servicesOf(e).some(x => x.service_id === s.service_id))) : V.services;
        const eps = self ? mine : C.endpoints;
        const hits = self ? mine.reduce((a, e) => a + e.hits, 0) : svcs.reduce((a, s) => a + s.hits, 0);
        const gov = {}; ['approved', 'unapproved', 'prohibited', 'under_review', 'beta', 'unlabelled'].forEach(k => { gov[k] = svcs.filter(s => s.status === k).length; });
        const shadow = V.services.filter(s => ['unapproved', 'prohibited', 'unlabelled'].includes(s.status)).reduce((a, s) => a + s.hits, 0);
        const body = { services: svcs.length, users: self ? 1 : new Set(C.endpoints.filter(e => e.user && e.owner_kind === 'person').map(e => e.user)).size, departments: self ? 1 : new Set(C.endpoints.map(e => e.department).filter(Boolean)).size, bytes: eps.reduce((a, e) => a + e.bytes, 0), hits, agent_alerts: V.detections.filter(d => d.disposition === 'escalated' && (!self || mineIds.has(d.endpoint_id))).length,
          new_services: svcs.filter(s => s.is_new).length, embedded_services: svcs.filter(s => s.embedded_in).length,
          endpoints: { total: eps.length, laptop: eps.filter(e => e.type === 'laptop').length, vm: eps.filter(e => e.type === 'vm').length, other: eps.filter(e => e.type === 'other').length },
          governance: gov, unreviewed: gov.unlabelled, unreviewed_new: svcs.filter(s => s.status === 'unlabelled' && s.is_new).length,
          shadow_share_pct: self ? null : Math.round(shadow / hits * 1000) / 10,
          previous: self ? null : { services: 25, hits: C.shadow_previous.hits, shadow_share_pct: Math.round(C.shadow_previous.shadow_hits / C.shadow_previous.hits * 1000) / 10 } };
        return ok(body, winHeaders());
      }
      case 'listServices': {
        let list = V.services;
        if (self) { const mix = {}; mine.forEach(e => servicesOf(e).forEach(x => { mix[x.service_id] = (mix[x.service_id] || 0) + x.hits; })); list = list.filter(s => mix[s.service_id]).map(s => ({ ...s, hits: mix[s.service_id], endpoints: mine.filter(e => servicesOf(e).some(x => x.service_id === s.service_id)).length, users: 1 })); }
        if (params.status) list = list.filter(s => params.status === 'shadow' ? ['unapproved', 'prohibited', 'unlabelled'].includes(s.status) : s.status === params.status);
        const { page, h } = paginate(list.map(serviceShape), +params.limit || 50);
        return ok(page, winHeaders(h));
      }
      case 'getService': {
        const s = V.services.find(x => x.service_id === params.service_id); if (!s) return notFound('service');
        const users = C.endpoints.filter(e => servicesOf(e).some(x => x.service_id === s.service_id) && (!self || isMine(persona, e)));
        if (self && !users.length) return forbidden(persona, opId);
        return ok({ service: serviceShape(s), description: s.description, top_endpoints: users.slice(0, 6).map(e => ({ endpoint_id: e.endpoint_id, host: e.host, ip: e.ip, type: e.type, user: e.identity_source ? e.user : null, department: e.department, hits: servicesOf(e).find(x => x.service_id === s.service_id).hits, last_seen: e.last_seen })), status_history: s.reviewed_at ? [{ status: 'unlabelled', by: 'system', at: s.first_seen, note: null }, { status: s.status, by: s.reviewed_by, at: s.reviewed_at, note: null }] : [{ status: 'unlabelled', by: 'system', at: s.first_seen, note: null }] }, winHeaders());
      }
      case 'listDiscoveryEndpoints': {
        let list = self ? mine : C.endpoints; if (params.type) list = list.filter(e => e.type === params.type);
        const { page, h } = paginate(list.slice().sort((a, b) => b.hits - a.hits).map(discEpShape), +params.limit || 50);
        return ok(page, winHeaders(h));
      }
      case 'getDiscoveryEndpoint': {
        const e = EP[params.endpoint_id]; if (!e) return notFound('endpoint'); if (self && !isMine(persona, e)) return forbidden(persona, opId);
        return ok({ endpoint: (({ hits, bytes, services, ...r }) => r)(discEpShape(e)), services: servicesOf(e).map(x => ({ service_id: x.service_id, ai_service: SVC[x.service_id].ai_service, status: (V.services.find(s => s.service_id === x.service_id) || SVC[x.service_id]).status, hits: x.hits, last_seen: e.last_seen })) }, winHeaders());
      }
      case 'getUsageGraph': {
        const top = C.endpoints.filter(e => e.user && e.owner_kind === 'person').sort((a, b) => b.hits - a.hits).slice(0, 12);
        const right = {}; const edges = [];
        top.forEach(e => servicesOf(e).forEach(x => { right[x.service_id] = (right[x.service_id] || 0) + x.hits; edges.push({ from: 'user:' + e.user.toLowerCase().replace(/\s+/g, '.'), to: x.service_id, hits: x.hits }); }));
        return ok({ left: top.map(e => ({ id: 'user:' + e.user.toLowerCase().replace(/\s+/g, '.'), label: e.user, sub: e.department, hits: e.hits })), right: Object.entries(right).map(([id, hits]) => ({ id, label: SVC[id].ai_service, status: SVC[id].status, hits })), edges }, winHeaders());
      }
      case 'getSensors': case 'getSettingsSensors': return ok(C.sensors, { 'X-Data-As-Of': String(M.data_as_of) });
      case 'getSettingsDirectory': return ok(C.sensors.directory);
      case 'listConsoleUsers': return ok(Object.entries(personas).map(([id, x]) => ({ id: 'usr_' + id, name: x.name, email: x.email, role: x.role_claim, console_role: x.console })));
      case 'getFleetSummary': {
        const eps = self ? mine : C.endpoints; const n = s => eps.filter(e => e.agent_state === s).length;
        return ok({ endpoints: eps.length, enforcing: n('enforcing'), record_only: n('record_only'), offline: n('offline'), no_agent: n('no_agent'), allowed: eps.reduce((a, e) => a + e.allowed, 0), blocked: eps.reduce((a, e) => a + e.blocked, 0), recorded: eps.reduce((a, e) => a + e.recorded, 0) }, winHeaders());
      }
      case 'listDevices': {
        let list = (self ? mine : C.endpoints).filter(e => e.device_id);
        if (params.agent_state) list = list.filter(e => e.agent_state === params.agent_state);
        if (params.group_id) list = list.filter(e => e.group_id === params.group_id);
        const { page, h } = paginate(list.slice().sort((a, b) => b.blocked - a.blocked).map(deviceShape), +params.limit || 50);
        return ok(page, winHeaders(h));
      }
      case 'getDevice': { const e = EP_BY_DEV[params.id]; if (!e) return notFound('device'); if (self && !isMine(persona, e)) return forbidden(persona, opId); return ok({ ...deviceShape(e), os: e.os }, winHeaders()); }
      case 'listDeviceEvents': {
        const e = EP_BY_DEV[params.id]; if (!e) return notFound('device'); if (self && !isMine(persona, e)) return forbidden(persona, opId);
        const ds = V.detections.filter(d => d.device_id === e.device_id);
        const evs = ds.map(d => ({ id: uuidFrom(d.detection_id), ts: d.ts, identity: (e.user || '').toLowerCase().replace(/\s+/g, '.'), device: e.host, app: d.evidence.exfil ? d.evidence.exfil.destination : 'Anthropic Claude (API)', action: 'detection', target: d.target_type, source: 'sandbox', decision: d.disposition === 'recorded' ? 'record' : 'block', reason: lv === 'redacted' ? null : d.teaser, rule_id: d.rule_id, session_id: d.session_id, tool: d.tool, channel: d.tool ? 'agent' : 'browser_app', enforced_by: FAM[d.rule_id].dlp ? 'dlp' : 'detector' }));
        if (e.host === 'LT-SG-2231') evs.push({ id: uuidFrom('pastebin'), ts: NOW - 7200 + 25, identity: 'rahul.iyer', device: e.host, app: 'pastebin.com', action: 'network', target: 'pastebin.com:443', source: 'sandbox', decision: 'block', reason: 'Egress not in the CUE allow-list', rule_id: null, session_id: 'sbx_7c21e9a04b3f', tool: 'claude-code', channel: 'agent', enforced_by: 'cue' });
        return ok(evs.sort((a, b) => b.ts - a.ts));
      }
      case 'getDetectionsSummary': {
        const ds = self ? V.detections.filter(d => mineIds.has(d.endpoint_id)) : V.detections;
        const fams = C.detection_families.map(f => { const r = ds.filter(d => d.rule_id === f.rule_id); return { rule_id: f.rule_id, label: f.label, description: f.description, severity: f.severity, owasp: f.owasp, signal: f.signal, hits: r.length, devices: new Set(r.map(d => d.host)).size, groups: new Set(r.map(d => d.group_id).filter(Boolean)).size, blocked: r.filter(d => d.disposition === 'blocked').length, recorded: r.filter(d => d.disposition === 'recorded').length, escalated: r.filter(d => d.disposition === 'escalated').length }; }).filter(f => !self || f.hits);
        return ok({ totals: { detections: ds.length, families: fams.filter(f => f.hits).length, critical: ds.filter(d => d.severity === 'critical').length, escalated: ds.filter(d => d.disposition === 'escalated').length, devices: new Set(ds.map(d => d.host)).size }, families: fams }, winHeaders());
      }
      case 'listDetections': {
        let ds = self ? V.detections.filter(d => mineIds.has(d.endpoint_id)) : V.detections;
        ['rule_id', 'severity', 'disposition', 'device_id', 'session_id'].forEach(k => { if (params[k]) ds = ds.filter(d => d[k] === params[k]); });
        const { page, h } = paginate(ds.map(d => detRowShape(d, lv)), +params.limit || 50);
        return ok(page, h);
      }
      case 'getDetection': { const d = V.detections.find(x => x.detection_id === params.detection_id); if (!d) return notFound('detection'); if (self && !mineIds.has(d.endpoint_id)) return forbidden(persona, opId); const out = detDetail(d, lv); if (self) out.fix_hint = d.fix_hint || FIX[d.rule_id] || null; return ok(out); }
      case 'listSessions': {
        let list = self ? C.sessions.rows.filter(s => mineIds.has(s.endpoint_id)) : C.sessions.rows;
        if (params.outcome) list = list.filter(s => s.outcome === params.outcome);
        const { page, h } = paginate(list.map(sessionShape), +params.limit || 50);
        if (!self && !params.outcome) h['X-Total-Count'] = String(C.sessions.totals.total);
        if (!self && params.outcome) h['X-Total-Count'] = String(C.sessions.totals[params.outcome]);
        return ok(page, h);
      }
      case 'getSessionsSummary': { if (self) { const r = C.sessions.rows.filter(s => mineIds.has(s.endpoint_id)); return ok({ total: r.length, clean: r.filter(s => s.outcome === 'clean').length, detected: r.filter(s => s.outcome === 'detected').length, stopped: r.filter(s => s.outcome === 'stopped').length }); } return ok(C.sessions.totals, winHeaders()); }
      case 'getSessionActivity': { const s = C.sessions.rows.find(x => x.sid === params.sid); if (!s) return notFound('session'); if (self && !mineIds.has(s.endpoint_id)) return forbidden(persona, opId); return ok(sessionActivity(s, lv, V.detections)); }
      case 'getUsageSummary': {
        if (self) { const u = C.usage.by_user.find(x => x.person === p.name); return ok(u ? { turns: u.turns, users: 1, sessions: u.sessions, cost_usd: u.cost_usd, tokens: u.tokens, input_tokens: u.input, output_tokens: u.output, cache_read_tokens: u.cache_read, hard_stops: C.usage.stops.filter(s => s.person === p.name).length, rate_card_id: C.usage.summary.rate_card_id } : { turns: 0, users: 1, sessions: 0, cost_usd: 0, tokens: 0 }, winHeaders()); }
        const s = C.usage.summary; return ok({ turns: s.turns, users: s.users, sessions: s.sessions, cost_usd: s.cost_usd, tokens: s.tokens, input_tokens: s.input_tokens, output_tokens: s.output_tokens, cache_read_tokens: s.cache_read_tokens, hard_stops: s.hard_stops, rate_card_id: s.rate_card_id }, winHeaders());
      }
      case 'getUsageByModel': {
        const rows = C.usage.by_model.map(m => ({ model: m.model, provider: m.provider, wire: m.wire, input_tokens: m.input_tokens, output_tokens: m.output_tokens, cache_read_tokens: m.cache_read_tokens, cost_usd: m.cost_usd, sessions: m.sessions, users: m.users, groups: m.groups, top_groups: m.top_groups.map(t => ({ name: t.group_id ? G[t.group_id].name : 'Ungrouped', cost_usd: t.cost_usd })), rate_per_mtok: m.rate_per_mtok }));
        if (self) { const g = C.usage.by_group.find(x => x.group_id === 'grp_payments_eng'); return ok(rows.filter(r => g.models[r.model]).map(r => ({ model: r.model, provider: r.provider, wire: r.wire, rate_per_mtok: r.rate_per_mtok }))); }
        return ok(rows, winHeaders());
      }
      case 'getUsageByGroup': return ok(C.usage.by_group.map(g => { const us = C.usage.by_user.filter(u => u.group_id === g.group_id); return { group: g.group_id ? groupRef(g.group_id) : { id: 'ungrouped', name: 'Ungrouped' }, tokens: us.reduce((a, u) => a + u.tokens, 0), cost_usd: g.cost, sessions: g.sessions, users: g.users, stops: g.stops }; }), winHeaders());
      case 'getUsageByUser': {
        let list = C.usage.by_user; if (self) list = list.filter(u => u.person === p.name);
        const { page, h } = paginate(list.map(u => ({ person: u.person, turns: u.turns, sessions: u.sessions, input: u.input, output: u.output, cost_usd: u.cost_usd, department: u.group_id ? G[u.group_id].name : null, group: groupRef(u.group_id), cache_read: u.cache_read, tokens: u.tokens })), +params.limit || 50);
        return ok(page, h);
      }
      case 'getUsageBudgets': {
        const groups = C.usage.by_group.filter(g => g.cap_usd).map(g => ({ group: groupRef(g.group_id), cap_usd: g.cap_usd, cap_scope: 'per_user_24h', mode: g.mode, cost_usd: g.cost, sessions: g.sessions, users: g.users, avg_usd_per_user: Math.round(g.cost / g.users / 7 * 100) / 100, stops: g.stops }));
        const stops = C.usage.stops.map(s => ({ ts: s.ts, sid: s.sid, person: s.person, group: groupRef(s.group_id), cap_usd: s.cap_usd, cap_scope: s.cap_scope, spend_usd: s.spend_usd, stop_turn: s.stop_turn }));
        if (self) return ok({ groups: groups.filter(g => g.group.id === 'grp_payments_eng'), stops: stops.filter(s => s.person === p.name) });
        return ok({ groups, stops }, winHeaders());
      }
      case 'listDiscoveredMcps': { let list = self ? C.mcp_discovered.filter(m => mineIds.has(m.endpoint_id)) : C.mcp_discovered; if (params.flag) list = list.filter(m => m.flags.includes(params.flag)); const { page, h } = paginate(list, +params.limit || 50); return ok(page, h); }
      case 'getEndpointMcps': { const e = EP[params.endpoint_id]; if (!e) return notFound('endpoint'); if (self && !isMine(persona, e)) return forbidden(persona, opId); if (e.agent_state === 'no_agent') return { status: 409, headers: {}, body: { core_installed: false, message: 'Install Core to scan MCPs and skills on this endpoint.', endpoints_without_core: 1 } }; return ok({ endpoint_id: e.endpoint_id, core_installed: true, mcps: C.mcp_discovered.filter(m => m.endpoint_id === e.endpoint_id).map(({ mcp_id, name, kind, bridge_state, risk_tier, flags }) => ({ mcp_id, name, kind, bridge_state, risk_tier, flags })), skills: C.skills.filter(s => s.endpoint_id === e.endpoint_id).map(({ endpoint_id, ...s }) => s) }); }
      case 'listDiscoveredSkills': { const list = self ? C.skills.filter(s => mineIds.has(s.endpoint_id)) : C.skills; const { page, h } = paginate(list, +params.limit || 50); return ok(page, h); }
      case 'listGroups': return ok(V.groups.map(groupShape));
      case 'getGroupMcpPolicy': { const g = V.groups.find(x => x.id === params.id); return g ? ok(mcpPolicy(g)) : notFound('group'); }
      case 'listCues': { const list = [...V.cues.map(c => cueSummary(c)), ...V.cues.filter(c => c.draft).map(c => cueSummary(c, true))]; const { page, h } = paginate(list, +params.limit || 50); return ok(page, h); }
      case 'getCue': { const draftId = params.id.endsWith('_draft'); const c = V.cues.find(x => x.id === params.id || (draftId && x.draft && x.id.replace(/_v\d+$/, '') + '_v' + x.draft.version + '_draft' === params.id)); return c ? ok(cueDetail(c, V.cues, draftId)) : notFound('CUE'); }
      case 'listCueVersions': { const c = V.cues.find(x => x.id === params.id); if (!c) return notFound('CUE'); return ok(c.versions.map((v, i) => ({ version: v[0], state: i === 0 ? 'published' : 'superseded', published_at: v[1], published_by: v[2], change: v[3], endpoints: i === 0 ? c.endpoints_current : i === 1 ? c.endpoints_on_older : 0 }))); }
      case 'listBridgeMcps': { let list = V.bridge; if (params.status) list = list.filter(b => b.status === params.status); return ok(list.map(b => bridgeShape(b, V.groups))); }
      case 'getBridgeMcp': { const b = V.bridge.find(x => x.id === params.id); return b ? ok(bridgeShape(b, V.groups)) : notFound('MCP'); }
      case 'getBridgeScan': { const b = V.bridge.find(x => x.id === params.id); return b ? ok({ status: b.status, risk_score: b.risk_score, findings: b.findings }) : notFound('MCP'); }
      case 'listBlastRoots': { const list = self ? C.blast.filter(b => mine.some(e => e.host === b.host)) : C.blast; return ok(list.map(blastRoot), winHeaders()); }
      case 'getBlastGraph': { const b = C.blast.find(x => x.execution_id === params.execution_id); if (!b) return notFound('execution'); if (self && !mine.some(e => e.host === b.host)) return forbidden(persona, opId); return ok(b.graph); }
      case 'blastRadiusDesignTimeDeprecated': return { status: 410, headers: {}, body: { error: 'Gone — replaced by /api/protect/blast-radius', code: 'NOT_FOUND', request_id: reqId('410') } };
      // ---- demo: console edits saved by the server ----
      case 'getConsoleState': return ok({ saved_at: live.slicesSavedAt || null, slices: live.slices || {} });
      // ---- proposed /api/me/* ----
      case 'getMyAccess': return ok(myAccess(persona, V, live));
      case 'listMyMcpRequests': return ok(myRequests(persona, V, live));
      case 'listMyDevices': return ok(mine.filter(e => e.device_id).map(e => ({ ...deviceShape(e), os: e.os })));
      case 'listMySessions': return ok(C.sessions.rows.filter(s => mineIds.has(s.endpoint_id)).map(sessionShape));
      case 'listMyDetections': return ok(V.detections.filter(d => mineIds.has(d.endpoint_id)).map(d => ({ ...detRowShape(d, 'read'), fix_hint: d.fix_hint || FIX[d.rule_id] || null, why: FAM[d.rule_id].description })));
      default: return null;
    }
  }
  function uuidFrom(s) { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; }

  function myAccess(persona, V, live = {}) {
    const p = personas[persona]; const e = C.endpoints.find(x => x.user === p.name);
    const person = C.people.find(x => x.name === p.name) || {};
    const gid = person.group_id || (e && e.group_id);
    const g = V.groups.find(x => x.id === gid);
    const cue = g && g.assigned_cue_id ? V.cues.find(c => c.id === g.assigned_cue_id) : (e && e.tools.includes('claude-code') ? V.cues[0] : null);
    const allow = g ? g.mcp_allow : [];
    const approved = V.bridge.filter(b => b.status === 'approved' && allow.includes(b.name) && (!cue || cue.mcp_servers.includes(b.name) || b.name === 'confluence')).map(b => b.name);
    const budget = C.usage.by_group.find(x => x.group_id === gid);
    const exc = ((live.budgetExceptions || {})[persona] || null) && live.budgetExceptions[persona].until > Date.now() ? live.budgetExceptions[persona] : null;
    return {
      user: { name: p.name, email: p.email, role: p.role_claim, group: groupRef(gid) },
      tools: [...new Set(C.endpoints.filter(x => x.user === p.name).flatMap(x => x.tools))],
      models: budget ? Object.keys(budget.models) : ['claude-sonnet-5'],
      cue: cue ? { id: cue.id, name: cue.name, version: cue.version, base: cue.base_cue_id ? V.cues.find(c => c.id === cue.base_cue_id).name : null, pending_draft: cue.draft ? { version: cue.draft.version, adds: cue.draft.add_dlp, by: cue.draft.by } : null } : null,
      mcp_servers: approved, mcp_access: approved.map(n => ({ name: n, expires_at: g ? expIso(g, n) : null })), mcp_policy: g ? { allow: g.mcp_allow, deny: g.mcp_deny } : null,
      egress_allow: cue ? cue.egress_allow : [], dlp_rules: cue ? cue.dlp_rules : [],
      budget: budget && budget.cap_usd ? { cap_usd: exc ? exc.cap_usd : budget.cap_usd, cap_scope: 'per_user_24h', mode: budget.mode, exception: exc ? { cap_usd: exc.cap_usd, group_cap_usd: budget.cap_usd, approved_by: exc.approved_by, expires_at: new Date(exc.until).toISOString() } : null, spend_today_usd: persona === 'rahul' ? C.usage.rahul_today.spend_usd + (live.rahulSpendExtra || 0) : null } : null,
      writable_mounts_note: 'Writable paths are passed at launch with --src/--writable; they are not part of a CUE.',
    };
  }
  function myRequests(persona, V, live = {}) {
    const p = personas[persona];
    return V.bridge.filter(b => b.requested_by === p.name || (live.myRequests || []).some(r => r.by === persona && r.name === b.name)).map(b => ({ id: b.id, name: b.name, status: b.status === 'scanning' ? (b.findings && b.findings.scan_complete ? 'awaiting_decision' : 'scanning') : b.status, bridge_status: b.status, reason: b.request_reason || ((live.myRequests || []).find(r => r.name === b.name) || {}).reason || null, requested_at: b.created_at, decided_by: b.status !== 'scanning' ? b.approved_by : null, decided_at: b.decided_at || null }));
  }

  return { handle, level, view, servicesOf, groupRef, forbidden, err, ops: OPS, myAccess, myRequests, FIX };
}

// Match a request path to an operation in the access matrix. Returns { op, params } or null.
export function matchOp(ops, method, pathname) {
  for (const op of ops) {
    if (op.method !== method) continue;
    const names = []; const re = new RegExp('^' + op.path.replace(/\{([^}]+)\}/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    const m = pathname.match(re); if (m) return { op, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
