import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { USERS, publicUser } from './users.js';
import { getState, resetState, subscribe, emit, loadState, setPersist, persist, notify } from './state.js';
import { runCommand, terminalHello, HOSTS } from './terminal.js';
import { TENANT, IS_BANK, BANK, HOSTS_LIST, tenant } from './tenants/index.js';
import { matchOp } from '../scripts/lib/tenant-api.mjs';
import { cuePushMessage } from './terminals/straits-meridian.js';
import { makeWorkflows } from './workflows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
app.use(express.json(IS_BANK ? { limit: '2mb' } : undefined));

// --- tiny cookie session (no external dep) -----------------------------------
const sessions = new Map(); // sid -> userId
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function currentUser(req) {
  const sid = parseCookies(req).rs_sid;
  const uid = sid && sessions.get(sid);
  return uid ? { id: uid, ...USERS[uid] } : null;
}
// API Error shape { error, code, request_id } (v2.1 components/schemas/Error)
const rid = () => 'req_' + crypto.randomBytes(4).toString('base64url');
const apiErr = (res, status, code, error) => res.status(status).json({ error, code, request_id: rid() });
function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) { if (IS_BANK) apiErr(res, 401, 'UNAUTHENTICATED', 'Not signed in.'); else res.status(401).json({ error: 'not signed in' }); return null; }
  return u;
}

// --- auth --------------------------------------------------------------------
function login(req, res) {
  const { username, password, email } = req.body || {};
  const key = (username || '').toLowerCase() || Object.keys(USERS).find(k => USERS[k].email === (email || '').toLowerCase()) || '';
  const u = USERS[key];
  if (!u || u.password !== password) return IS_BANK ? apiErr(res, 401, 'UNAUTHENTICATED', 'Wrong username or password.') : res.status(401).json({ error: 'Wrong username or password.' });
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, key);
  res.setHeader('Set-Cookie', `rs_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
  res.json({ ok: true, user: publicUser(key) });
}
app.post('/api/login', login);
if (IS_BANK) app.post('/api/auth/login', login);
app.post('/api/logout', (req, res) => {
  const sid = parseCookies(req).rs_sid;
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', 'rs_sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  if (!IS_BANK) return res.json({ user: u ? publicUser(u.id) : null });
  // Bank: API `User` shape (getMe) plus the legacy `user` object the login/terminal pages read.
  if (!u) return res.json({ user: null });
  const r = BANK.api.handle(u.id, 'getMe', {});
  res.json({ ...r.body, user: publicUser(u.id) });
});

// --- shared demo state + live stream -----------------------------------------
app.get('/api/state', (req, res) => {
  if (!requireUser(req, res)) return;
  const s = getState();
  res.json({ epoch: s.epoch, events: s.events, mcpReq: s.mcpReq, engCueVersion: s.engCueVersion, syncedVersion: s.syncedVersion, policyHits: s.policyHits });
});

app.get('/api/stream', (req, res) => {
  const u = currentUser(req);
  if (!u) { res.status(401).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`event: hello\ndata: ${JSON.stringify({ epoch: getState().epoch })}\n\n`);
  const send = evt => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  const unsub = subscribe(send);
  const ka = setInterval(() => res.write(': ka\n\n'), 20000);
  req.on('close', () => { clearInterval(ka); unsub(); });
});

// --- actions (RBAC enforced) -------------------------------------------------
if (!IS_BANK) app.post('/api/mcp/decision', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  if (!u.perms.approveMcp) return res.status(403).json({ error: 'Your role cannot approve MCP requests.' });
  const { decision } = req.body || {};
  const s = getState();
  if (!s.mcpReq || s.mcpReq.status !== 'pending') return res.status(409).json({ error: 'No pending MCP request.' });
  if (decision === 'approved') {
    s.mcpReq.status = 'approved';
    s.engCueVersion += 1;
    s.syncedVersion['LT-4821'] = s.engCueVersion;
    emit({ type: 'mcpDecision', id: s.mcpReq.id, name: 'linear', decision: 'approved', by: u.name, cueVersion: s.engCueVersion });
    // The developer's endpoint receives the signed CUE a moment later.
    emit({ type: 'cuePushed', host: 'LT-4821', name: 'linear', cueVersion: s.engCueVersion, by: u.name, role: 'engineering', tool: 'claude-code' }, 1200);
  } else {
    s.mcpReq.status = 'denied';
    emit({ type: 'mcpDecision', id: s.mcpReq.id, name: 'linear', decision: 'denied', by: u.name });
  }
  res.json({ ok: true });
});

function doReset(req, res) {
  const u = requireUser(req, res); if (!u) return;
  if (IS_BANK ? !u.perms.reset : !u.perms.viewAll) return IS_BANK ? res.status(403).json(BANK.api.forbidden(u.id, 'resetDemo').body) : res.status(403).json({ error: 'Not allowed.' });
  resetState();
  res.json({ ok: true });
}
app.post('/api/reset', doReset);

// --- terminal ----------------------------------------------------------------
function terminalAccess(u, host, write) {
  if (!HOSTS[host]) return false;
  if (!IS_BANK) return u.perms.viewAll || u.perms.terminal.includes(host);
  if (!u.perms.terminal.includes(host)) return false;
  return write ? u.perms.terminalMode === 'exec' : u.perms.terminalMode !== 'none';
}
app.get('/api/terminal/hosts', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  const hosts = IS_BANK ? u.perms.terminal : (u.perms.viewAll ? HOSTS_LIST : u.perms.terminal);
  res.json({ hosts, mode: IS_BANK ? u.perms.terminalMode : 'exec', userTag: IS_BANK ? 'rahul.iyer' : (u.id === 'dev' ? 'dev.patel' : 'analyst') });
});
app.get('/api/terminal/hello', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  const host = req.query.host || (u.perms.terminal[0]);
  if (!terminalAccess(u, host, false)) return IS_BANK ? apiErr(res, 403, 'FORBIDDEN', `${u.name} has no terminal access to ${host}.`) : res.status(403).json({ error: 'No access to this endpoint.' });
  res.json({ host, label: HOSTS[host].label, banner: IS_BANK ? terminalHello(host, u.perms.terminalMode === 'replay') : terminalHello(host), readOnly: IS_BANK && u.perms.terminalMode === 'replay' });
});
app.post('/api/terminal/exec', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  const { host, cmd } = req.body || {};
  if (!terminalAccess(u, host, true)) return IS_BANK ? apiErr(res, 403, 'FORBIDDEN', `${u.name} can view ${host} as a read-only replay but cannot run commands.`) : res.status(403).json({ error: 'No access to this endpoint.' });
  const result = runCommand(host, cmd, u);
  if (IS_BANK) persist();
  res.json(result);
});

// --- Straits Meridian: API router (access matrix + fixtures + live demo state) ---
if (IS_BANK) {
  const { api, matrix, canonical: CAN } = BANK;

  // --- persistence: every change is saved to live-state.json and restored on restart ---
  const liveFile = path.join(root, 'data/tenants/straits-meridian/live-state.json');
  try {
    if (fs.existsSync(liveFile) && loadState(JSON.parse(fs.readFileSync(liveFile, 'utf8')))) console.log(`restored demo changes from ${path.relative(root, liveFile)}`);
  } catch (e) { console.warn('could not read live-state.json, starting from the seed:', e.message); }
  let saveTimer = null;
  const writeLive = () => {
    const s = getState();
    const snap = { $comment: 'Straits Meridian Bank (fictional) — demo changes saved by the server. Delete this file or use Reset demo to go back to the seed.', tenant: 'straits-meridian', saved_at: new Date().toISOString(), epoch: s.epoch, bank: s.bank, events: s.events };
    fs.writeFileSync(liveFile + '.tmp', JSON.stringify(snap, null, 1)); fs.renameSync(liveFile + '.tmp', liveFile);
  };
  setPersist(() => { clearTimeout(saveTimer); saveTimer = setTimeout(writeLive, 150); });
  const NOW = CAN.meta.now;
  const fixturesDir = path.join(root, 'data/tenants/straits-meridian/api');
  const bankState = () => getState().bank;
  const pristine = () => { const b = bankState(); return !Object.keys(b.serviceStatus).length && !Object.keys(b.bridge).length && !Object.keys(b.groupPolicy).length && b.payCueVersion === 3 && !b.extraDetections.length && !b.myRequests.length && !(b.newBridge || []).length && !b.rahulSpendExtra
    && !Object.keys(b.slices || {}).length && !(b.apiGroups || []).length && !(b.createdCues || []).length && !(b.deletedCues || []).length && !Object.keys(b.cueEdits || {}).length && !Object.keys(b.groupCue || {}).length && !(b.removedBridge || []).length && !Object.keys(b.budgetExceptions || {}).length && !Object.keys(b.mcpGrants || {}).length; };
  const live = () => { const b = bankState(); return { serviceStatus: b.serviceStatus, bridge: b.bridge, groupPolicy: b.groupPolicy, payCueVersion: b.payCueVersion, payCuePublishedBy: b.payCuePublishedBy, payCuePublishedAt: b.payCuePublishedAt, extraDetections: b.extraDetections, myRequests: b.myRequests, newBridge: b.newBridge || [], rahulSpendExtra: b.rahulSpendExtra,
    slices: b.slices || {}, slicesSavedAt: b.slicesSavedAt || null, apiGroups: b.apiGroups || [], createdCues: b.createdCues || [], deletedCues: b.deletedCues || [], cueEdits: b.cueEdits || {}, groupCue: b.groupCue || {}, removedBridge: b.removedBridge || [], budgetExceptions: b.budgetExceptions || {}, mcpGrants: b.mcpGrants || {} }; };
  const fileName = (method, p) => method + '__' + p.replace(/^\//, '').replace(/\//g, '__').replace(/[^A-Za-z0-9_.-]/g, '_') + '.json';
  const send = (res, r, src) => { for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v); res.setHeader('X-Fixture', src); res.setHeader('Access-Control-Expose-Headers', 'X-Window-From, X-Window-To, X-Data-As-Of, X-Total-Count, X-Next-Cursor'); res.status(r.status).json(r.body); };
  const group = id => CAN.groups.find(g => g.id === id);
  const allowOf = gid => (bankState().groupPolicy[gid] || {}).mcp_allow || group(gid).mcp_allow;

  // Time-limited MCP access per group: bank.mcpGrants[groupId][mcpName] = { expires_at (ms) | null, granted_by, granted_at }.
  const grantsOf = gid => { const m = (bankState().mcpGrants || {})[gid] || {}; const o = {}; for (const [n, x] of Object.entries(m)) o[n] = x.expires_at ? new Date(x.expires_at).toISOString() : null; return o; };
  const grant = (gid, n, expMs, by) => { const bs = bankState(); bs.mcpGrants = bs.mcpGrants || {}; bs.mcpGrants[gid] = { ...(bs.mcpGrants[gid] || {}), [n]: { expires_at: expMs || null, granted_by: by, granted_at: Date.now() } }; };
  const ungrant = (gid, n) => { const m = (bankState().mcpGrants || {})[gid]; if (m) delete m[n]; };
  // Relative, because the demo's calendar is frozen (28 Sep) while grants expire in real time.
  const fmtExp = ms => { const m = Math.max(1, Math.round((ms - Date.now()) / 60000)); return m < 60 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' days'; };
  // access_expires_at (ISO) or access_ttl_minutes; returns ms, null (no expiry) or false (invalid).
  const expiryOf = body => {
    if (body.access_expires_at != null) { const t = Date.parse(body.access_expires_at); return t > Date.now() ? t : false; }
    if (body.access_ttl_minutes != null) { const m = Number(body.access_ttl_minutes); return m > 0 && m <= 366 * 24 * 60 ? Date.now() + m * 60000 : false; }
    return null;
  };
  // Expiry sweep: an expired grant is removed from the group policy, and the people involved are told.
  setInterval(() => {
    const bs = bankState(), now = Date.now(); let n = 0;
    for (const [gid, m] of Object.entries(bs.mcpGrants || {})) for (const [name, x] of Object.entries(m)) {
      if (!x.expires_at || x.expires_at > now) continue;
      delete m[name]; n++;
      const g = api.view(live()).groups.find(k => k.id === gid); if (!g) continue;
      bs.groupPolicy[gid] = { mcp_allow: g.mcp_allow.filter(k => k !== name), mcp_deny: g.mcp_deny, policy_updated_by: 'expiry', policy_updated_at: NOW };
      emit({ type: 'accessChanged', groupId: gid, groupConsoleId: g.console_id, allow: bs.groupPolicy[gid].mcp_allow, expires: grantsOf(gid), by: 'Expiry', expired: name });
      WF.expired(gid, g.name, name, x.granted_by);
      if (gid === 'grp_payments_eng') for (const host of ['LT-SG-2231', 'vm-dev-rahul-07']) emit({ type: 'cuePushed', host, kind: 'mcp-expired', message: `${name} access for Engineering — Payments expired — run: aegis mcp request ${name} --reason "…" to renew`, by: 'Expiry' });
    }
    if (n) persist();
  }, 5000).unref();

  // Write operations: permission is checked before this runs; these mutate demo state and emit events.
  const WRITES = {
    setServiceStatus(u, p, body) {
      const s = CAN.services.find(x => x.service_id === p.service_id); if (!s) return { status: 404, body: { error: 'No service with that id.', code: 'NOT_FOUND', request_id: rid() } };
      const status = body.status; if (!['approved', 'unapproved', 'prohibited', 'under_review', 'beta'].includes(status)) return { status: 400, body: { error: 'status must be approved | unapproved | prohibited | under_review | beta.', code: 'INVALID_PARAMETER', request_id: rid() } };
      bankState().serviceStatus[s.service_id] = { status, reviewed_by: u.name, reviewed_at: NOW };
      emit({ type: 'serviceStatus', serviceId: s.service_id, name: s.ai_service, status, by: u.name });
      return { status: 200, body: { service_id: s.service_id, status, reviewed_by: u.name, reviewed_at: NOW } };
    },
    decideBridgeMcp(u, p, body) {
      const b = api.view(live()).bridge.find(x => x.id === p.id); if (!b) return { status: 404, body: { error: 'No MCP with that id.', code: 'NOT_FOUND', request_id: rid() } };
      const status = body.status; if (!['approved', 'blocked'].includes(status)) return { status: 400, body: { error: 'status must be approved or blocked.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const exp = expiryOf(body); if (exp === false) return { status: 400, body: { error: 'access_expires_at must be a future ISO time, or access_ttl_minutes a positive number.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const bs = bankState();
      // Suspend (kill switch): an approved server is blocked everywhere but keeps its group policy, so Reinstate restores it.
      if (status === 'blocked' && (body.suspend || b.status === 'approved')) {
        bs.bridge[b.id] = { ...(bs.bridge[b.id] || {}), status: 'blocked', suspended: true, suspended_by: u.name, suspended_at: NOW, suspended_reason: body.approved_reason || null };
        emit({ type: 'mcpSuspended', bridgeId: b.id, name: b.name, suspended: true, by: u.name, reason: body.approved_reason || null });
        return api.handle(u.id, 'getBridgeMcp', { id: b.id }, live());
      }
      if (status === 'approved' && b.suspended) {
        bs.bridge[b.id] = { ...(bs.bridge[b.id] || {}), status: 'approved', suspended: false, reinstated_by: u.name };
        emit({ type: 'mcpSuspended', bridgeId: b.id, name: b.name, suspended: false, by: u.name });
        if (!body.group_id) return api.handle(u.id, 'getBridgeMcp', { id: b.id }, live());
      }
      const gid = body.group_id || (b.name === 'confluence' ? 'grp_payments_eng' : null);
      bs.bridge[b.id] = { ...(bs.bridge[b.id] || {}), status, suspended: false, approved_by: u.name, approved_reason: body.approved_reason || (status === 'approved' ? `Approved for ${gid ? group(gid).name : 'selected groups'}` : 'Blocked'), decided_at: NOW, findings: { ...b.findings, summary: status === 'approved' ? 'Scan passed · approved' : 'Blocked', scan_complete: true } };
      if (status === 'approved' && gid) {
        if (!allowOf(gid).includes(b.name)) bs.groupPolicy[gid] = { mcp_allow: [...allowOf(gid), b.name], mcp_deny: ((bs.groupPolicy[gid] || {}).mcp_deny || group(gid).mcp_deny).filter(n => n !== b.name), policy_updated_by: u.name, policy_updated_at: NOW };
        grant(gid, b.name, exp, u.name);
      }
      emit({ type: 'mcpDecision', mcpId: 'm-' + b.name, bridgeId: b.id, name: b.name, decision: status === 'approved' ? 'approved' : 'denied', by: u.name, groupId: gid, groupConsoleId: gid ? group(gid).console_id : null, expiresAt: status === 'approved' && gid ? exp : null });
      if (b.name === 'confluence' && status === 'approved') for (const host of ['LT-SG-2231', 'vm-dev-rahul-07']) emit({ type: 'cuePushed', host, kind: 'mcp', message: `confluence approved by ${u.name} for Engineering — Payments${exp ? ' for ' + fmtExp(exp) : ''} — the MCP is now available through the Aegis Bridge`, by: u.name }, 900);
      return api.handle(u.id, 'getBridgeMcp', { id: b.id }, live());
    },
    publishCue(u, p) {
      const isPay = ['cue_payments_v3', 'cue_payments_v4_draft'].includes(p.id);
      const c = CAN.cues.find(x => x.id === p.id); if (!isPay && !c) return { status: 404, body: { error: 'No CUE with that id.', code: 'NOT_FOUND', request_id: rid() } };
      if (isPay) {
        const b = bankState();
        if (b.payCueVersion >= 4) return { status: 200, body: { id: 'cue_payments_v3', version: 4, endpoints_targeted: 0 } };
        b.payCueVersion = 4; b.payCuePublishedBy = u.name; b.payCuePublishedAt = NOW;
        emit({ type: 'cuePublished', cueId: 'cue_payments_v3', draftId: 'cue_payments_v4_draft', version: 4, by: u.name });
        setTimeout(() => { if (getState().bank !== b) return; for (const host of ['LT-SG-2231', 'vm-dev-rahul-07']) { b.syncedVersion[host] = 4; emit({ type: 'cuePushed', host, cueVersion: 4, tool: 'claude-code', role: 'payments-eng', by: u.name, message: cuePushMessage(4) }); } }, 1200);
        return { status: 200, body: { id: 'cue_payments_v3', version: 4, endpoints_targeted: group('grp_payments_eng').member_count } };
      }
      emit({ type: 'audit', action: 'publishCue', target: c.id, by: u.name });
      return { status: 200, body: { id: c.id, version: c.version + 1, endpoints_targeted: c.endpoints_current + c.endpoints_on_older } };
    },
    setGroupMcpPolicy(u, p, body) {
      const g = group(p.id); if (!g) return { status: 404, body: { error: 'No group with that id.', code: 'NOT_FOUND', request_id: rid() } };
      const name = x => (api.view(live()).bridge.find(b => b.id === x) || {}).name || x;
      const allow = (body.allow || []).map(name);
      const exp = {}; for (const [k, v] of Object.entries(body.expires || {})) { const t = v == null ? null : Date.parse(v); if (t !== null && !(t > Date.now())) return { status: 400, body: { error: 'expires values must be future ISO times or null.', code: 'INVALID_PARAMETER', request_id: rid() } }; exp[name(k)] = t; }
      const before = allowOf(g.id);
      bankState().groupPolicy[g.id] = { mcp_allow: allow, mcp_deny: (body.deny || g.mcp_deny).map(name), policy_updated_by: u.name, policy_updated_at: NOW };
      for (const n of before.filter(n => !allow.includes(n))) ungrant(g.id, n);
      for (const n of allow) if (Object.prototype.hasOwnProperty.call(exp, n) || !before.includes(n)) grant(g.id, n, exp[n] ?? null, u.name);
      emit({ type: 'accessChanged', groupId: g.id, groupConsoleId: g.console_id, allow, expires: grantsOf(g.id), by: u.name });
      return api.handle(u.id, 'getGroupMcpPolicy', { id: g.id }, live());
    },
    assignGroupCue(u, p, body) {
      const g = api.view(live()).groups.find(x => x.id === p.id); if (!g) return { status: 404, body: { error: 'No group with that id.', code: 'NOT_FOUND', request_id: rid() } };
      if (!body.cue_id || !api.view(live()).cues.some(c => c.id === body.cue_id)) return { status: 400, body: { error: 'cue_id must be an existing CUE.', code: 'INVALID_PARAMETER', request_id: rid() } };
      bankState().groupCue[g.id] = body.cue_id; emit({ type: 'audit', action: 'assignGroupCue', target: g.id, cue: body.cue_id, by: u.name });
      return { status: 200, body: { group_id: g.id, cue_id: body.cue_id, endpoints_targeted: g.member_count } };
    },
    createCue(u, p, body) {
      if (!body.name || !body.tool || !body.scope) return { status: 400, body: { error: 'name, tool and scope are required.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const base = body.base_cue_id ? api.view(live()).cues.find(c => c.id === body.base_cue_id) : null;
      const c = { id: 'cue_' + crypto.randomBytes(3).toString('hex'), name: body.name, tool: body.tool, scope: body.scope, scope_ref: body.scope_ref || null, group_id: body.scope === 'group' ? body.scope_ref : null, base_cue_id: base ? base.id : null, version: 1, state: 'draft', updated_by: u.name, updated_at: NOW,
        egress_allow: [...new Set([...(base ? base.egress_allow : []), ...(body.egress_allow || [])])], mcp_servers: body.mcp_servers || [], dlp_rules: [...new Set([...(base ? base.dlp_rules : []), ...(body.dlp_rules || [])])], internal_tools: [], endpoints_current: 0, endpoints_on_older: 0, versions: [[1, NOW, u.name, 'created']] };
      bankState().createdCues.push(c); emit({ type: 'audit', action: 'createCue', target: c.id, by: u.name });
      return api.handle(u.id, 'getCue', { id: c.id }, live());
    },
    updateCue(u, p, body) {
      const cur = api.view(live()).cues.find(c => c.id === p.id); if (!cur) return { status: 404, body: { error: 'No CUE with that id.', code: 'NOT_FOUND', request_id: rid() } };
      const edit = { state: 'draft', version: cur.version + 1, updated_by: u.name, updated_at: NOW };
      for (const k of ['egress_allow', 'mcp_servers', 'dlp_rules']) if (Array.isArray(body[k])) edit[k] = body[k];
      bankState().cueEdits[p.id] = { ...(bankState().cueEdits[p.id] || {}), ...edit }; emit({ type: 'audit', action: 'updateCue', target: p.id, by: u.name });
      return api.handle(u.id, 'getCue', { id: p.id }, live());
    },
    deleteCue(u, p) {
      const v = api.view(live()); if (!v.cues.some(c => c.id === p.id)) return { status: 404, body: { error: 'No CUE with that id.', code: 'NOT_FOUND', request_id: rid() } };
      const used = v.groups.find(g => g.assigned_cue_id === p.id); if (used) return { status: 400, body: { error: `CUE is assigned to ${used.name}; assign another CUE first.`, code: 'INVALID_PARAMETER', request_id: rid() } };
      bankState().deletedCues.push(p.id); emit({ type: 'audit', action: 'deleteCue', target: p.id, by: u.name }); return { status: 200, body: { deleted: true } };
    },
    removeBridgeMcp(u, p) {
      const b = api.view(live()).bridge.find(x => x.id === p.id); if (!b) return { status: 404, body: { error: 'No MCP with that id.', code: 'NOT_FOUND', request_id: rid() } };
      // Deboard: gone from the Bridge and from every group that allowed it; running sessions lose it at once.
      const bs = bankState(); bs.removedBridge.push(p.id);
      for (const g of api.view(live()).groups.filter(x => x.mcp_allow.includes(b.name))) { bs.groupPolicy[g.id] = { mcp_allow: g.mcp_allow.filter(n => n !== b.name), mcp_deny: g.mcp_deny, policy_updated_by: u.name, policy_updated_at: NOW }; ungrant(g.id, b.name); }
      emit({ type: 'mcpRemoved', bridgeId: b.id, name: b.name, by: u.name });
      emit({ type: 'audit', action: 'removeBridgeMcp', target: p.id, by: u.name }); return { status: 200, body: { deleted: true } };
    },
    onboardMcp(u, p, body) {
      if (!body.name) return { status: 400, body: { error: 'name is required.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const rec = { id: 'mcp_' + body.name.replace(/[^a-z0-9]/gi, '_').toLowerCase(), name: body.name, source: body.source || 'custom', kind: body.kind || 'remote', status: 'scanning', risk_score: null, risk_tier: null, capabilities: null, findings: null, approved_by: null, approved_reason: null, created_at: NOW, requested_by: u.name };
      const b = bankState(); b.newBridge = [...(b.newBridge || []), rec];
      emit({ type: 'mcpOnboarded', bridgeId: rec.id, name: rec.name, by: u.name });
      setTimeout(() => { if (!(b.newBridge || []).some(x => x.id === rec.id) || getState().bank !== b) return; b.bridge[rec.id] = { ...(b.bridge[rec.id] || {}), risk_score: 26, risk_tier: 'low', findings: { high: 0, medium: 0, low: 1, summary: 'Scan passed · awaiting an Admin or CISO decision', scan_complete: true }, capabilities: { tools: ['tools found at scan'], writes: false } }; emit({ type: 'mcpScanned', bridgeId: rec.id, name: rec.name, summary: '0 high · 1 low · awaiting decision', tools: 'tools found at scan' }); }, 2200);
      return api.handle(u.id, 'getBridgeMcp', { id: rec.id }, live());
    },
    createGroup(u, p, body) {
      if (!body.name) return { status: 400, body: { error: 'name is required.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const id = 'grp_' + body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (api.view(live()).groups.some(g => g.id === id)) return { status: 400, body: { error: 'A group with that name exists.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const g = { id, console_id: id.slice(4), name: body.name, member_count: (body.member_endpoint_ids || []).length, assigned_cue_id: null, assigned_cue_name: null, recert_due: null, mcp_allow: [], mcp_deny: [], owner: u.name, desc: 'Created through the API' };
      bankState().apiGroups.push(g); emit({ type: 'audit', action: 'createGroup', target: id, by: u.name });
      return { status: 200, body: { id, name: g.name, member_count: g.member_count, assigned_cue_id: null, assigned_cue_name: null, recert_due: null, mcp_policy_id: 'mcpp_' + id.slice(4) } };
    },
    // Console edits (groups, policies, CUEs, settings, device groups): each area needs its own permission.
    saveConsoleState(u, p, body) {
      const NEED = { roles: body.op === 'createGroup' ? 'createGroup' : 'assignPolicy', policies: 'editCue', cues: body.op === 'retire' ? 'deleteCue' : body.op === 'import' ? 'editCue' : 'publishCue', settings: 'settingsWrite', fleetRoles: 'assignPolicy' };
      const perm = NEED[body.slice];
      if (!perm || body.value === undefined) return { status: 400, body: { error: 'slice must be one of ' + Object.keys(NEED).join(', ') + ' and value is required.', code: 'INVALID_PARAMETER', request_id: rid() } };
      if (!USERS[u.id].perms[perm]) return { status: 403, body: { error: `Only ${(BANK.holders[perm] || []).join(' or ') || 'an administrator'} can change ${body.slice === 'roles' ? 'groups' : body.slice === 'fleetRoles' ? 'device groups' : body.slice}. Your change was not saved.`, code: 'FORBIDDEN', request_id: rid() } };
      const b = bankState(); b.slices = { ...(b.slices || {}), [body.slice]: body.value }; b.slicesSavedAt = Math.floor(Date.now() / 1000);
      notify({ type: 'sliceUpdated', slice: body.slice, value: body.value, by: u.name, clientId: body.clientId || null });
      emit({ type: 'audit', action: 'saveConsoleState', target: body.slice, op: body.op || null, by: u.name });
      return { status: 200, body: { saved: true, slice: body.slice, saved_at: b.slicesSavedAt } };
    },
    createMyMcpRequest(u, p, body) {
      const name = (body.name || '').trim(); if (!name) return { status: 400, body: { error: 'name is required.', code: 'INVALID_PARAMETER', request_id: rid() } };
      const b = bankState(); const reason = body.reason || null;
      const existing = [...CAN.bridge, ...(b.newBridge || [])].find(x => x.name === name);
      if (!b.myRequests.some(r => r.by === u.id && r.name === name)) b.myRequests.push({ by: u.id, name, reason, at: Date.now(), via: 'me' });
      if (!existing) b.newBridge = [...(b.newBridge || []), { id: 'mcp_' + name.replace(/[^a-z0-9]/gi, '_').toLowerCase(), name, source: body.source || 'requested from /me', kind: 'remote', status: 'scanning', risk_score: null, risk_tier: null, capabilities: null, findings: { scan_complete: false, summary: 'Scan running' }, approved_by: null, approved_reason: null, created_at: NOW, requested_by: u.name, request_reason: reason }];
      const rec = [...CAN.bridge, ...(b.newBridge || [])].find(x => x.name === name);
      emit({ type: 'mcpRequest', mcpId: 'm-' + name, bridgeId: rec.id, name, by: u.name, reason, host: (CAN.endpoints.find(e => e.user === u.name) || {}).host || null, tool: 'claude-code', role: 'payments-eng' });
      if (!u.perms.decideMcp) WF.submit(u, { kind: 'mcp_access', bridge_id: rec.id, reason, via: 'me' }); // approvers get it in their inbox
      return { status: 200, body: api.myRequests(u.id, api.view(live()), live()).find(r => r.name === name) };
    },
    updateSensor(u, p) { emit({ type: 'audit', action: 'updateSensor', target: p.id, by: u.name }); return { status: 200, body: { ok: true, id: p.id } }; },
    updateDirectory(u) { emit({ type: 'audit', action: 'updateDirectory', by: u.name }); return { status: 200, body: { ok: true } }; },
    updateConsoleUser(u, p) { emit({ type: 'audit', action: 'updateConsoleUser', target: p.id, by: u.name }); return { status: 200, body: { ok: true, id: p.id } }; },
    resetDemo() { resetState(); return { status: 200, body: { ok: true } }; },
    logout() { return { status: 204, body: {} }; },
    refresh() { return { status: 200, body: { access_token: 'demo-cookie-session', token_type: 'Bearer', expires_in: 900 } }; },
  };

  // Approvals: a request runs the same write as the approver once it is approved (src/workflows.js).
  const run = (opId, u, params, body, wfId) => { const r = WRITES[opId](u, params, body || {}); if (r.status < 300) WF.onDirect(opId, u, params, body || {}, !!wfId); return r; };
  const WF = makeWorkflows({ bank: bankState, CAN, USERS, holders: BANK.holders, notify, emit, run, view: () => api.view(live()), rid });
  const LIVE = {
    listInbox: u => WF.inbox(u.id),
    markInboxRead: (u, p, body) => WF.markRead(u.id, body),
    getWorkflow: (u, p) => WF.get(u.id, p.id),
    submitWorkflow: (u, p, body) => WF.submit(u, body),
    decideWorkflow: (u, p, body) => WF.decide(u, p.id, body),
    recommendWorkflow: (u, p, body) => WF.recommend(u, p.id, body),
    withdrawWorkflow: (u, p) => WF.withdraw(u, p.id),
  };

  app.all('/api/*', (req, res, next) => {
    const m = matchOp(matrix.operations, req.method, req.path);
    if (!m) return apiErr(res, 404, 'NOT_FOUND', `No route ${req.method} ${req.path}.`);
    if (m.op.operationId === 'login') return next();
    const u = requireUser(req, res); if (!u) return;
    const lv = m.op.access[u.id] || 'deny';
    if (lv === 'deny') return send(res, api.forbidden(u.id, m.op.operationId), 'live');
    if (LIVE[m.op.operationId]) { const r = LIVE[m.op.operationId](u, m.params, req.body || {}); if (req.method !== 'GET') persist(); return send(res, { headers: {}, ...r }, 'live'); }
    if (req.method === 'GET') {
      const noQuery = !Object.keys(req.query).length;
      const f = path.join(fixturesDir, u.id, fileName('GET', req.path));
      if (noQuery && pristine() && fs.existsSync(f)) { const fx = JSON.parse(fs.readFileSync(f, 'utf8')); return send(res, fx, 'file'); }
      const r = api.handle(u.id, m.op.operationId, { ...req.query, ...m.params }, live());
      return r ? send(res, r, 'live') : apiErr(res, 404, 'NOT_FOUND', 'Not implemented.');
    }
    const w = WRITES[m.op.operationId];
    if (!w) return apiErr(res, 404, 'NOT_FOUND', 'Not implemented.');
    const r = w(u, m.params, req.body || {});
    if (r.status < 300) WF.onDirect(m.op.operationId, u, m.params, req.body || {}, false);
    persist();
    send(res, { headers: {}, ...r }, 'live');
  });
}

// --- pages -------------------------------------------------------------------
app.use('/static', express.static(path.join(root, 'public')));
// Console assets and bridge (served straight from public/console).
app.use('/console/assets', express.static(path.join(root, 'public/console/assets')));
app.get('/console/bridge.js', (req, res) => res.sendFile(path.join(root, 'public/console/bridge.js')));
if (IS_BANK) app.use('/console-bank', express.static(path.join(root, 'public/console-bank')));

const page = f => fs.readFileSync(path.join(root, 'public', f), 'utf8');
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c');

app.get('/', (req, res) => {
  const u = currentUser(req);
  res.redirect(u ? USERS[u.id].landing : '/login');
});
app.get('/login', (req, res) => {
  let html = page('login.html');
  if (IS_BANK) {
    html = html.replace('Agentic control plane — demo tenant · Northwind Capital', `Agentic control plane — demo tenant · ${tenant.name} (fictional)`);
    // Credentials are not shown on the bank sign-in page; they are documented in LOGINS.md.
    const start = html.indexOf('<div class="accts">'), end = html.indexOf('<div class="foot">');
    if (start > 0 && end > start) html = html.slice(0, start) + html.slice(end);
    html = html.replace('All accounts use password <code>demo</code>', 'Demo data · fictional');
  }
  res.type('html').send(html);
});

app.get('/console', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.redirect('/login');
  if (!USERS[u.id].console) return res.redirect(IS_BANK ? '/me' : '/terminal');
  if (IS_BANK) {
    let html = fs.readFileSync(path.join(root, 'public/console-bank/index.html'), 'utf8');
    const U = USERS[u.id];
    const roleLabel = U.roleClaim === 'ciso' ? 'CISO' : U.console;
    const demoUser = { id: u.id, name: U.name, role: U.console, roleLabel, roleClaim: U.roleClaim, perms: U.perms, title: U.title, demoBar: U.demoBar, holders: BANK.holders, tenant: tenant.name };
    const seed = { ...BANK.seed.base, ...BANK.seed.personas[u.id] };
    html = html.split('__DEMO_USER_JSON__').join(safeJson(demoUser)).split('__DEMO_SEED_JSON__').join(safeJson(seed)).split('__DEMO_USER_NAME__').join(U.name);
    return res.type('html').send(html);
  }
  let html = fs.readFileSync(path.join(root, 'public/console/index.html'), 'utf8');
  const demoUser = { name: u.name, role: USERS[u.id].console, perms: USERS[u.id].perms, title: USERS[u.id].title };
  html = html.split('__DEMO_USER_JSON__').join(JSON.stringify(demoUser).replace(/</g, '\\u003c'));
  html = html.split('__DEMO_USER_NAME__').join(u.name);
  res.type('html').send(html);
});

if (IS_BANK) app.get('/me', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.redirect('/login');
  res.type('html').send(page('me.html'));
});

app.get('/terminal', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.redirect('/login');
  if (IS_BANK && USERS[u.id].perms.terminalMode === 'none') return res.redirect('/console');
  res.type('html').send(page('terminal.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RayShield demo on :${PORT} · tenant ${TENANT}`));
