// Approval workflows and the inbox (Straits Meridian tenant, fictional).
//
// A person who lacks a permission can ask someone who holds it. The request becomes a workflow item that
// waits in the approvers' inbox; the approver's decision runs the same write the approver could have made
// directly, so roles are still enforced in one place (src/server.js WRITES). Admin and CISO act directly on
// their own changes (no second approver), so they only ever request what their own role cannot do.
//
// Everything is kept in the bank demo state (bank.workflows, bank.notices) and saved to live-state.json.
import crypto from 'node:crypto';

let current = null;
export const workflows = () => current;   // the terminal attaches its MCP requests through this

const id = p => p + '_' + crypto.randomBytes(4).toString('hex');
const clip = (s, n = 300) => (s == null ? null : String(s).slice(0, n));
export const TTL = [[2, '2 minutes (demo)'], [60, '1 hour'], [480, '8 hours'], [1440, '24 hours'], [10080, '7 days'], [43200, '30 days'], [129600, '90 days'], [0, 'No expiry']];
const ttlLabel = m => (TTL.find(t => t[0] === m) || [0, m + ' minutes'])[1];
const hashOf = v => crypto.createHash('sha1').update(JSON.stringify(v === undefined ? null : v)).digest('hex').slice(0, 12);

// Which permission each console area needs (mirrors saveConsoleState in src/server.js).
export function slicePerm(slice, op) {
  return { roles: op === 'createGroup' ? 'createGroup' : 'assignPolicy', policies: 'editCue', cues: op === 'retire' ? 'deleteCue' : op === 'import' ? 'editCue' : 'publishCue', settings: 'settingsWrite', fleetRoles: 'assignPolicy' }[slice];
}
const AREA = { roles: 'groups', policies: 'policies', cues: 'CUEs', settings: 'settings (rates and budgets)', fleetRoles: 'device groups' };

// The flows that need approval. `perm` is what the approver must hold; `ask` is who may request it.
export const KINDS = {
  mcp_access:      { label: 'MCP access',        perm: () => 'decideMcp',   ask: u => !u.perms.decideMcp,                        approve: 'Approve', reject: 'Block' },
  mcp_decision:    { label: 'MCP decision',      perm: () => 'decideMcp',   ask: u => u.perms.viewAll && !u.perms.decideMcp,     approve: 'Approve', reject: 'Block' },
  mcp_onboard:     { label: 'Onboard MCP',       perm: () => 'onboardMcp',  ask: u => u.perms.viewAll && !u.perms.onboardMcp,    approve: 'Approve and onboard', reject: 'Reject' },
  mcp_remove:      { label: 'Suspend or deboard MCP', perm: p => (p.action === 'remove' ? 'removeMcp' : 'decideMcp'), ask: (u, p) => u.perms.viewAll && !u.perms[p.action === 'remove' ? 'removeMcp' : 'decideMcp'], approve: 'Approve', reject: 'Reject' },
  cue_publish:     { label: 'CUE publish',       perm: () => 'publishCue',  ask: u => !!u.perms.draftCue && !u.perms.publishCue, approve: 'Approve and publish', reject: 'Reject' },
  group_policy:    { label: 'Group MCP policy',  perm: () => 'assignPolicy', ask: u => u.perms.viewAll && !u.perms.assignPolicy, approve: 'Approve and apply', reject: 'Reject' },
  console_change:  { label: 'Console change',    perm: p => slicePerm(p.slice, p.op), ask: (u, p) => u.perms.viewAll && !u.perms[slicePerm(p.slice, p.op)], approve: 'Approve and apply', reject: 'Reject' },
  budget_exception:{ label: 'Budget exception',  perm: () => 'settingsWrite', ask: u => u.perms.scope === 'self',                approve: 'Approve', reject: 'Reject' },
};

export function makeWorkflows({ bank, CAN, USERS, holders, notify, emit, run, view, rid }) {
  const B = () => {
    const b = bank();
    if (!b.workflows) { b.workflows = seedWorkflows(); b.notices = seedNotices(b.workflows); }
    b.notices = b.notices || [];
    return b;
  };
  const name = uid => (USERS[uid] || {}).name || uid;
  const roleOf = uid => { const u = USERS[uid] || {}; return u.roleClaim === 'ciso' ? 'CISO' : u.roleClaim === 'developer' ? 'Developer' : u.console || u.roleClaim; };
  const approversOf = perm => Object.keys(USERS).filter(k => USERS[k].perms && USERS[k].perms[perm]);
  const bridgeRec = bid => (view().bridge || []).find(b => b.id === bid);
  const groupName = gid => ((CAN.groups.find(g => g.id === gid) || view().groups.find(g => g.id === gid)) || { name: gid }).name;
  const err = (status, code, error) => ({ status, body: { error, code, request_id: rid() } });

  // ---------- seed: the demo starts with Rahul's confluence request waiting (3 h old) ----------
  function seedWorkflows() {
    const c = CAN.bridge.find(b => b.name === 'confluence');
    const at = Date.now() - 3 * 3600 * 1000;
    return [{
      id: 'wf_confluence', kind: 'mcp_access', subject: 'mcp:' + c.id, status: 'pending',
      requested_by: 'rahul', requested_at: at, via: 'me', reason: c.request_reason,
      payload: { bridgeId: c.id, name: c.name, groupId: 'grp_payments_eng' },
      recommendations: [], history: [{ at, by: 'Rahul Iyer', action: 'requested', note: 'from My access (/me)' }],
    }];
  }
  function seedNotices(items) {
    return items.map(w => ({ id: 'ntc_' + w.id, at: w.requested_at, to: approversOf(KINDS[w.kind].perm(w.payload)), wf: w.id, kind: 'action', by: name(w.requested_by), text: describe(w).ask, read: [] }));
  }

  // ---------- presentation (server-side so console, /me, terminal and API agree) ----------
  function describe(w) {
    const p = w.payload || {}, who = name(w.requested_by);
    switch (w.kind) {
      case 'mcp_access': {
        const b = bridgeRec(p.bridgeId) || {};
        const tools = ((b.capabilities || {}).tools || []).join(', ');
        return { title: `${p.name} MCP server for ${groupName(p.groupId)}`, ask: `${who} asks for the ${p.name} MCP server`,
          changes: [...(b.status === 'approved' ? [] : [`+ ${p.name} onboarded in the MCP Bridge${tools ? ' · ' + tools : ''}${b.capabilities && b.capabilities.writes === false ? ' (read-only)' : ''}`]), `+ ${p.name} allowed for ${groupName(p.groupId)}${p.ttl_minutes ? ' · asked for ' + ttlLabel(p.ttl_minutes) : ''}`],
          facts: [['Requested by', `${who} · ${groupName(p.groupId)}`], ['Security scan', b.findings ? b.findings.summary : 'running'], ['Risk', b.risk_tier ? `${b.risk_tier} · ${b.risk_score}` : '—']],
          link: { page: 'approvals' } };
      }
      case 'mcp_decision': {
        const b = bridgeRec(p.bridgeId) || {};
        return { title: `Decide on the ${p.name} MCP server`, ask: `${who} recommends you ${p.recommendation === 'block' ? 'block' : 'approve'} ${p.name}`,
          changes: [p.recommendation === 'block' ? `− ${p.name} blocked in the MCP Bridge` : `+ ${p.name} approved in the MCP Bridge${p.groupId ? ' for ' + groupName(p.groupId) : ''}`],
          facts: [['Security scan', b.findings ? b.findings.summary : '—'], ['Risk', b.risk_tier ? `${b.risk_tier} · ${b.risk_score}` : '—']], link: { page: 'bridge' } };
      }
      case 'mcp_onboard':
        return { title: `Onboard ${p.name} in the MCP Bridge`, ask: `${who} asks to onboard the ${p.name} MCP server`,
          changes: [`+ ${p.name} from ${p.source || 'custom source'} · security scan runs, then Admin or CISO approves it for groups`], facts: [['Source', p.source || '—']], link: { page: 'bridge' } };
      case 'mcp_remove':
        return p.action === 'remove'
          ? { title: `Deboard ${p.name} from the MCP Bridge`, ask: `${who} asks to deboard the ${p.name} MCP server`,
              changes: [`− ${p.name} removed from the MCP Bridge`, `− access removed from every group that allows it · running sessions lose it at once`], facts: [], link: { page: 'bridge' } }
          : { title: `Suspend ${p.name} in the MCP Bridge`, ask: `${who} asks to suspend the ${p.name} MCP server`,
              changes: [`− ${p.name} blocked for every group until reinstated`, '= group policies are kept, so Reinstate restores access'], facts: [], link: { page: 'bridge' } };
      case 'cue_publish':
        return p.cueId === 'cue_payments_v3'
          ? { title: 'Publish Payments CUE v4', ask: `${who} asks you to publish Payments CUE v4`,
              changes: [...(p.adds || []).map(r => `+ DLP ${r} · Enforce`), '= inherited rows from Bank baseline stay locked', `→ signed as claude-code/payments-eng@v4 and pushed to ${(CAN.groups.find(g => g.id === 'grp_payments_eng') || {}).member_count || 0} endpoints`],
              facts: [['CUE', 'claude-code/payments-eng · v3 → v4'], ['Drafted by', who]], link: { page: 'cue', extra: { cueSel: 'cue_payments_v4_draft', retireOpen: false } } }
          : { title: clip(p.title || 'Publish CUE changes', 120), ask: `${who} asks you to publish a CUE change`, changes: (p.changes || []).slice(0, 12).map(x => clip(x, 160)), facts: [], link: { page: 'cues' } };
      case 'group_policy':
        return { title: `Change MCP access for ${groupName(p.groupId)}`, ask: `${who} asks to change MCP access for ${groupName(p.groupId)}`,
          changes: [...(p.add || []).map(n => `+ ${n} allowed`), ...(p.remove || []).map(n => `− ${n} no longer allowed`)], facts: [], link: { page: 'bridge' } };
      case 'console_change':
        return { title: clip(p.title || `Change ${AREA[p.slice]}`, 120), ask: `${who} asks to change ${AREA[p.slice]}`, changes: (p.changes || []).slice(0, 12).map(x => clip(x, 160)), facts: [['Area', AREA[p.slice]]],
          link: { page: { roles: 'roles', policies: 'roles', cues: 'cues', settings: 'usage', fleetRoles: 'fleet' }[p.slice] || 'home' } };
      case 'budget_exception':
        return { title: `Raise ${who}'s daily cap to USD ${p.cap_usd} for 24 h`, ask: `${who} asks for a higher daily budget`,
          changes: [`USD ${p.from_usd} → USD ${p.cap_usd} per 24 h · ${who} only · expires after 24 h`], facts: [['Current cap', `USD ${p.from_usd} · hard stop`]], link: { page: 'usage' } };
      default: return { title: w.kind, ask: w.kind, changes: [], facts: [], link: { page: 'home' } };
    }
  }
  function shape(w, uid) {
    const K = KINDS[w.kind], perm = K.perm(w.payload), d = describe(w), u = USERS[uid] || { perms: {} };
    const decider = !!u.perms[perm] && w.requested_by !== uid;
    return {
      id: w.id, kind: w.kind, kind_label: K.label, status: w.status, title: d.title, summary: d.ask, changes: d.changes, facts: d.facts, reason: w.reason || null,
      requested_by: { id: w.requested_by, name: name(w.requested_by), role: roleOf(w.requested_by) }, requested_at: new Date(w.requested_at).toISOString(), via: w.via || null,
      approver_permission: perm, approvers: holders[perm] || [], recommendations: w.recommendations || [], history: w.history || [],
      decided_by: w.decided_by || null, decided_at: w.decided_at ? new Date(w.decided_at).toISOString() : null, decision_note: w.decision_note || null,
      resubmit_body: w.status === 'returned' && w.requested_by === uid ? resubmitBody(w) : null,
      link: d.link, labels: { approve: K.approve, reject: w.payload && w.payload.renewal ? 'Decline' : K.reject }, takes_duration: /^mcp_(access|decision)$/.test(w.kind) ? (w.payload.recommendation !== 'block') : w.kind === 'group_policy' && (w.payload.add || []).length > 0, asked_duration_minutes: (w.payload && w.payload.ttl_minutes) || null,
      can: { decide: w.status === 'pending' && decider, recommend: w.status === 'pending' && !!u.perms.viewAll && !u.perms[perm] && w.requested_by !== uid && /^mcp_/.test(w.kind),
        withdraw: ['pending', 'returned'].includes(w.status) && w.requested_by === uid, resubmit: w.status === 'returned' && w.requested_by === uid },
    };
  }
  const resubmitBody = w => { const p = w.payload || {};
    if (w.kind === 'cue_publish' && p.cueId) return { kind: w.kind, cue_id: p.cueId };
    if (/^mcp_/.test(w.kind)) return { kind: w.kind, bridge_id: p.bridgeId, name: p.name, source: p.source, action: p.action, recommendation: p.recommendation, group_id: p.groupId };
    if (w.kind === 'group_policy') return { kind: w.kind, group_id: p.groupId, allow: p.allow };
    if (w.kind === 'budget_exception') return { kind: w.kind, cap_usd: p.cap_usd };
    return null; };
  const visible = (w, uid) => USERS[uid].perms.viewAll || w.requested_by === uid;

  // ---------- notices (the mailbox) ----------
  function notice(to, w, text, kind, by) {
    const list = [...new Set(to)].filter(Boolean); if (!list.length) return;
    const n = { id: id('ntc'), at: Date.now(), to: list, wf: w.id, kind, by, text, read: [] };
    B().notices.unshift(n); if (B().notices.length > 300) B().notices.length = 300;
    notify({ type: 'notice', to: list, wf: w.id, text, kind, by, noticeId: n.id });
  }
  const changed = (w, by) => notify({ type: 'workflow', wf: w.id, kind: w.kind, status: w.status, by, subject: w.subject || null });
  const approverIds = w => approversOf(KINDS[w.kind].perm(w.payload)).filter(k => k !== w.requested_by);
  const watchers = w => [w.requested_by, ...(w.recommendations || []).map(r => r.uid)];

  // ---------- requests ----------
  function submit(u, body) {
    const kind = body.kind, K = KINDS[kind];
    if (!K) return err(400, 'INVALID_PARAMETER', 'kind must be one of ' + Object.keys(KINDS).join(', ') + '.');
    const p = payloadFor(kind, u, body); if (p.status) return p;
    const perm = K.perm(p);
    if (!perm) return err(400, 'INVALID_PARAMETER', 'Unknown console area.');
    if (u.perms[perm]) return err(400, 'INVALID_PARAMETER', `${u.name} can do this directly; no approval is needed.`);
    if (!K.ask(u, p)) return err(403, 'FORBIDDEN', `${u.name} (${roleOf(u.id)}) cannot request this.`);
    const b = B(), subject = p.subject || null; delete p.subject;
    // One open request per subject: asking again (e.g. from the terminal) attaches to it.
    const open = subject && b.workflows.find(w => w.subject === subject && ['pending', 'returned'].includes(w.status));
    if (open) {
      const again = open.requested_by === u.id;
      if (open.kind === 'mcp_access' || open.kind === 'mcp_decision') {
        if (body.recommendation && !again) return recommend(u, open.id, body);
        if (!again) return { status: 200, body: shape(open, u.id) };
      } else if (!again) return err(409, 'CONFLICT', `${name(open.requested_by)} already asked for this; it is waiting for ${(holders[perm] || []).join(' or ')}.`);
      const wasReturned = open.status === 'returned';
      open.payload = { ...open.payload, ...p }; open.reason = clip(body.reason) || open.reason; open.status = 'pending';
      open.history.push({ at: Date.now(), by: u.name, action: wasReturned ? 'resubmitted' : 'asked again', note: body.via === 'terminal' ? 'from the terminal' : clip(body.reason) });
      notice(approverIds(open), open, `${u.name} ${wasReturned ? 'resubmitted' : 'asked again'}: ${describe(open).title}`, 'action', u.name);
      changed(open, u.name); return { status: 200, body: shape(open, u.id) };
    }
    const w = { id: id('wf'), kind, subject, status: 'pending', requested_by: u.id, requested_at: Date.now(), via: body.via || 'console', reason: clip(body.reason), payload: p, recommendations: [],
      history: [{ at: Date.now(), by: u.name, action: 'requested', note: body.via === 'terminal' ? 'from the terminal' : null }] };
    if (kind === 'mcp_decision' && p.recommendation) w.recommendations.push({ uid: u.id, by: u.name, recommendation: p.recommendation, note: clip(body.reason), at: Date.now() });
    b.workflows.unshift(w);
    notice(approverIds(w), w, describe(w).ask, 'action', u.name);
    emit({ type: 'audit', action: 'workflowRequested', target: w.id, kind, by: u.name });
    changed(w, u.name);
    return { status: 200, body: shape(w, u.id) };
  }

  function payloadFor(kind, u, body) {
    const v = view();
    switch (kind) {
      case 'mcp_access': case 'mcp_decision': {
        const b = v.bridge.find(x => x.id === body.bridge_id || x.name === body.name); if (!b) return err(404, 'NOT_FOUND', 'No MCP server with that id or name.');
        const gid = body.group_id || (kind === 'mcp_access' ? ((CAN.endpoints.find(e => e.user === u.name) || {}).group_id || 'grp_payments_eng') : (b.name === 'confluence' ? 'grp_payments_eng' : null));
        if (b.suspended) return err(409, 'CONFLICT', `${b.name} is suspended by ${b.suspended_by}.`);
        if (b.status === 'blocked') return err(409, 'CONFLICT', `${b.name} was blocked by ${b.approved_by || 'an approver'}.`);
        // An approved server can still be requested for a group that has no (or expired) access: that is a renewal.
        if (b.status === 'approved' && (kind === 'mcp_decision' || !gid || (v.groups.find(g => g.id === gid) || { mcp_allow: [] }).mcp_allow.includes(b.name))) return err(409, 'CONFLICT', `${b.name} is already approved${gid ? ' for ' + groupName(gid) : ''}.`);
        const ttl = Number(body.access_ttl_minutes) || 0;
        return { subject: 'mcp:' + b.id, bridgeId: b.id, name: b.name, groupId: gid, ttl_minutes: ttl > 0 ? ttl : undefined, renewal: b.status === 'approved' || undefined, recommendation: kind === 'mcp_decision' ? (body.recommendation === 'block' ? 'block' : 'approve') : undefined };
      }
      case 'mcp_onboard': {
        const n = clip((body.name || '').trim(), 60); if (!n) return err(400, 'INVALID_PARAMETER', 'name is required.');
        if (v.bridge.some(x => x.name === n)) return err(409, 'CONFLICT', `${n} is already in the MCP Bridge.`);
        return { subject: 'onboard:' + n, name: n, source: clip(body.source, 200) || 'custom', mcpKind: body.mcp_kind || 'remote' };
      }
      case 'mcp_remove': {
        const b = v.bridge.find(x => x.id === body.bridge_id || x.name === body.name); if (!b) return err(404, 'NOT_FOUND', 'No MCP server with that id or name.');
        const action = body.action === 'remove' ? 'remove' : 'suspend';
        if (action === 'suspend' && (b.suspended || b.status !== 'approved')) return err(409, 'CONFLICT', `${b.name} is not an active approved server.`);
        return { subject: (action === 'remove' ? 'remove:' : 'suspend:') + b.id, bridgeId: b.id, name: b.name, action };
      }
      case 'cue_publish': {
        if (body.cue_id === 'cue_payments_v3' || body.cue_id === 'cue_payments_v4_draft') {
          if ((bank().payCueVersion || 3) >= 4) return err(409, 'CONFLICT', 'Payments CUE v4 is already published.');
          const cur = v.cues.find(c => c.id === 'cue_payments_v3') || {};
          const adds = (cur.draft && cur.draft.add_dlp) || [];
          return { subject: 'cue:cue_payments_v3', cueId: 'cue_payments_v3', adds };
        }
        return sliceChange('cues', 'publish', body);
      }
      case 'group_policy': {
        const g = CAN.groups.find(x => x.id === body.group_id); if (!g) return err(404, 'NOT_FOUND', 'No group with that id.');
        const now = ((bank().groupPolicy[g.id] || {}).mcp_allow || g.mcp_allow), allow = (body.allow || []).map(String);
        return { subject: 'policy:' + g.id, groupId: g.id, allow, add: allow.filter(n => !now.includes(n)), remove: now.filter(n => !allow.includes(n)) };
      }
      case 'console_change': return sliceChange(body.slice, body.op, body);
      case 'budget_exception': {
        const gid = (CAN.endpoints.find(e => e.user === u.name) || {}).group_id, g = CAN.usage.by_group.find(x => x.group_id === gid);
        if (!g || !g.cap_usd) return err(400, 'INVALID_PARAMETER', 'Your group has no budget cap.');
        const cap = Math.round(Number(body.cap_usd) || 0); if (cap <= g.cap_usd || cap > g.cap_usd * 5) return err(400, 'INVALID_PARAMETER', `cap_usd must be above USD ${g.cap_usd} and at most USD ${g.cap_usd * 5}.`);
        return { subject: 'budget:' + u.id, uid: u.id, cap_usd: cap, from_usd: g.cap_usd };
      }
    }
    return err(400, 'INVALID_PARAMETER', 'Unknown kind.');
  }
  function sliceChange(slice, op, body) {
    if (!slicePerm(slice, op) || body.value === undefined) return err(400, 'INVALID_PARAMETER', 'slice and value are required.');
    return { slice, op: op || 'edit', value: body.value, base: hashOf((bank().slices || {})[slice]), title: clip(body.title, 120), changes: Array.isArray(body.changes) ? body.changes.map(x => clip(x, 160)) : [] };
  }

  // ---------- decisions ----------
  function decide(u, wid, body) {
    const w = B().workflows.find(x => x.id === wid); if (!w || !visible(w, u.id)) return err(404, 'NOT_FOUND', 'No request with that id.');
    const K = KINDS[w.kind], perm = K.perm(w.payload);
    if (!u.perms[perm]) return err(403, 'FORBIDDEN', `Only ${(holders[perm] || []).join(' or ')} can decide this.`);
    if (w.requested_by === u.id) return err(403, 'FORBIDDEN', 'You cannot decide your own request.');
    if (w.status !== 'pending') return err(409, 'CONFLICT', `This request is already ${w.status}${w.decided_by ? ' by ' + w.decided_by : ''}.`);
    const decision = body.decision, note = clip(body.note);
    if (!['approve', 'reject', 'return'].includes(decision)) return err(400, 'INVALID_PARAMETER', 'decision must be approve, reject or return.');
    if (decision === 'return' && !note) return err(400, 'INVALID_PARAMETER', 'Say what should change when you send a request back.');
    if (decision !== 'return') {
      const r = execute(w, u, decision === 'approve', note, body);
      if (r && r.status >= 300) {
        if (r.status === 409 && r.stale) { w.status = 'stale'; w.decided_by = u.name; w.decided_at = Date.now(); w.history.push({ at: Date.now(), by: u.name, action: 'could not apply', note: r.body.error });
          notice([w.requested_by], w, `${describe(w).title}: ${r.body.error}`, 'update', u.name); changed(w, u.name); }
        return r;
      }
    }
    w.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned';
    w.decided_by = u.name; w.decided_at = Date.now(); w.decision_note = note;
    w.history.push({ at: Date.now(), by: u.name, action: { approve: 'approved', reject: K.reject === 'Block' ? 'blocked' : 'rejected', return: 'sent back' }[decision], note });
    const t = decision === 'approve' && /^mcp_(access|decision)$|^group_policy$/.test(w.kind) ? ttlOf(body, w.payload) : undefined;
    if (t) w.history[w.history.length - 1].note = [note, 'access for ' + ttlLabel(t)].filter(Boolean).join(' · ');
    const verb = { approve: 'approved' + (t ? ' for ' + ttlLabel(t) : /^mcp_(access|decision)$/.test(w.kind) ? ' (no expiry)' : ''), reject: K.reject === 'Block' ? 'blocked' : 'rejected', return: 'sent back' }[decision];
    notice(watchers(w), w, `${u.name} ${verb}: ${describe(w).title}${note ? ' — “' + note + '”' : ''}`, 'update', u.name);
    notice(approverIds(w).filter(k => k !== u.id), w, `${u.name} ${verb}: ${describe(w).title}`, 'update', u.name);
    emit({ type: 'audit', action: 'workflowDecided', target: w.id, decision, by: u.name });
    changed(w, u.name);
    return { status: 200, body: shape(w, u.id) };
  }
  // Runs the underlying write as the approver (the same call they could make directly).
  const ttlOf = (opts, p) => { const m = opts && opts.access_ttl_minutes != null ? Number(opts.access_ttl_minutes) : (p.ttl_minutes || 0); return m > 0 ? m : undefined; };
  function execute(w, u, approve, note, opts) {
    const p = w.payload, who = name(w.requested_by);
    switch (w.kind) {
      case 'mcp_access': case 'mcp_decision':
        if (!approve && p.renewal) return null; // declining a renewal leaves the server as it is
        return run('decideBridgeMcp', u, { id: p.bridgeId }, approve ? { status: 'approved', group_id: p.groupId || undefined, approved_reason: note || `Requested by ${who}${w.reason ? ': ' + w.reason : ''}`, access_ttl_minutes: ttlOf(opts, p) } : { status: 'blocked', approved_reason: note || 'Blocked from the inbox' }, w.id);
      case 'mcp_onboard': if (!approve) return null; { const r = run('onboardMcp', u, {}, { name: p.name, source: p.source, kind: p.mcpKind }, w.id); return r; }
      case 'mcp_remove': return !approve ? null : p.action === 'remove' ? run('removeBridgeMcp', u, { id: p.bridgeId }, {}, w.id) : run('decideBridgeMcp', u, { id: p.bridgeId }, { status: 'blocked', suspend: true, approved_reason: w.reason || note || null }, w.id);
      case 'group_policy': { if (!approve) return null; const t = ttlOf(opts, p); return run('setGroupMcpPolicy', u, { id: p.groupId }, { allow: p.allow, expires: Object.fromEntries((p.add || []).map(n => [n, t ? new Date(Date.now() + t * 60000).toISOString() : null])) }, w.id); }
      case 'budget_exception': if (approve) { bank().budgetExceptions = { ...(bank().budgetExceptions || {}), [p.uid]: { cap_usd: p.cap_usd, approved_by: u.name, until: Date.now() + 86400000 } }; emit({ type: 'budgetException', uid: p.uid, name: who, cap_usd: p.cap_usd, by: u.name }); } return null;
      case 'cue_publish': if (!approve) return null; if (p.cueId) return run('publishCue', u, { id: p.cueId }, {}, w.id); /* falls through */
      case 'console_change': {
        if (!approve) return null;
        if (hashOf((bank().slices || {})[p.slice]) !== p.base) return { status: 409, stale: true, body: { error: `${AREA[p.slice][0].toUpperCase() + AREA[p.slice].slice(1)} changed after ${who} sent this. Ask them to make the change again.`, code: 'CONFLICT', request_id: rid() } };
        return run('saveConsoleState', u, {}, { slice: p.slice, op: p.op, value: p.value, clientId: 'workflow:' + w.id }, w.id);
      }
    }
    return null;
  }
  function recommend(u, wid, body) {
    const w = B().workflows.find(x => x.id === wid); if (!w) return err(404, 'NOT_FOUND', 'No request with that id.');
    const perm = KINDS[w.kind].perm(w.payload);
    if (u.perms[perm]) return err(400, 'INVALID_PARAMETER', `${u.name} can decide this directly.`);
    if (!/^mcp_/.test(w.kind) || w.status !== 'pending') return err(409, 'CONFLICT', 'Only a pending MCP request takes recommendations.');
    const rec = body.recommendation === 'block' ? 'block' : 'approve';
    w.recommendations = (w.recommendations || []).filter(r => r.uid !== u.id).concat([{ uid: u.id, by: u.name, recommendation: rec, note: clip(body.note || body.reason), at: Date.now() }]);
    w.history.push({ at: Date.now(), by: u.name, action: `recommends ${rec === 'block' ? 'blocking' : 'approval'}`, note: clip(body.note || body.reason) });
    notice(approverIds(w), w, `${u.name} recommends you ${rec} ${w.payload.name}${body.note || body.reason ? ' — “' + clip(body.note || body.reason, 120) + '”' : ''}`, 'action', u.name);
    changed(w, u.name);
    return { status: 200, body: shape(w, u.id) };
  }
  function withdraw(u, wid) {
    const w = B().workflows.find(x => x.id === wid); if (!w || !visible(w, u.id)) return err(404, 'NOT_FOUND', 'No request with that id.');
    if (w.requested_by !== u.id) return err(403, 'FORBIDDEN', 'Only the person who asked can withdraw a request.');
    if (!['pending', 'returned'].includes(w.status)) return err(409, 'CONFLICT', `This request is already ${w.status}.`);
    w.status = 'withdrawn'; w.history.push({ at: Date.now(), by: u.name, action: 'withdrew' });
    notice(approverIds(w), w, `${u.name} withdrew: ${describe(w).title}`, 'update', u.name);
    changed(w, u.name); return { status: 200, body: shape(w, u.id) };
  }

  // A direct write by someone who holds the permission closes the matching open request.
  function onDirect(opId, u, params, body, viaWorkflow) {
    if (viaWorkflow) return;
    const b = B(); let subject = null, approved = true;
    if (opId === 'decideBridgeMcp' && body.status === 'blocked' && (body.suspend || (b.workflows.some(x => x.subject === 'suspend:' + params.id)))) subject = 'suspend:' + params.id;
    else if (opId === 'decideBridgeMcp') { subject = 'mcp:' + params.id; approved = body.status === 'approved'; }
    else if (opId === 'publishCue' && ['cue_payments_v3', 'cue_payments_v4_draft'].includes(params.id)) subject = 'cue:cue_payments_v3';
    else if (opId === 'removeBridgeMcp') subject = 'remove:' + params.id;
    else if (opId === 'onboardMcp') subject = 'onboard:' + body.name;
    if (!subject) return;
    for (const w of b.workflows.filter(x => x.subject === subject && ['pending', 'returned'].includes(x.status))) {
      const K = KINDS[w.kind];
      w.status = approved ? 'approved' : 'rejected'; w.decided_by = u.name; w.decided_at = Date.now();
      const where = opId === 'decideBridgeMcp' ? 'on the MCP Bridge' : opId === 'publishCue' ? 'from the CUE screen' : 'directly';
      w.history.push({ at: Date.now(), by: u.name, action: approved ? 'approved' : (K.reject === 'Block' ? 'blocked' : 'rejected'), note: 'decided ' + where });
      notice(watchers(w), w, `${u.name} ${approved ? 'approved' : K.reject === 'Block' ? 'blocked' : 'rejected'}: ${describe(w).title}`, 'update', u.name);
      notice(approverIds(w).filter(k => k !== u.id), w, `${u.name} ${approved ? 'approved' : 'decided'} ${describe(w).title} ${where}`, 'update', u.name);
      changed(w, u.name);
    }
  }

  // ---------- reads ----------
  function inbox(uid) {
    const b = B(), u = USERS[uid];
    const mine = b.workflows.filter(w => w.requested_by === uid || (w.recommendations || []).some(r => r.uid === uid));
    const decide = b.workflows.filter(w => w.status === 'pending' && w.requested_by !== uid && u.perms[KINDS[w.kind].perm(w.payload)]);
    const updates = b.notices.filter(n => n.to.includes(uid)).slice(0, 60).map(n => ({ id: n.id, at: new Date(n.at).toISOString(), kind: n.kind, by: n.by, text: n.text, workflow_id: n.wf, read: n.read.includes(uid) }));
    return { status: 200, body: { unread: updates.filter(n => !n.read).length, pending_decisions: decide.length, access_durations: TTL.map(([minutes, label]) => ({ minutes, label })),
      needs_decision: decide.map(w => shape(w, uid)), my_requests: mine.map(w => shape(w, uid)), updates } };
  }
  function get(uid, wid) { const w = B().workflows.find(x => x.id === wid); return w && visible(w, uid) ? { status: 200, body: shape(w, uid) } : err(404, 'NOT_FOUND', 'No request with that id.'); }
  function markRead(uid, body) {
    const ids = body && Array.isArray(body.ids) ? body.ids : null, wf = body && body.workflow_id;
    let n = 0; for (const x of B().notices) if (x.to.includes(uid) && !x.read.includes(uid) && (!ids && !wf || (ids && ids.includes(x.id)) || (wf && x.wf === wf))) { x.read.push(uid); n++; }
    if (n) notify({ type: 'noticeRead', to: [uid] });
    return { status: 200, body: { marked_read: n } };
  }
  // Open requests on a subject (e.g. 'mcp:mcp_confluence'), for the terminal and Home.
  const openFor = subject => B().workflows.find(w => w.subject === subject && ['pending', 'returned'].includes(w.status)) || null;

  // A time-limited grant ran out: tell whoever asked for it, the approvers, and (demo) the developer in that group.
  function expired(gid, gname, mcpName, grantedBy) {
    const b = B(), w = b.workflows.find(x => /^mcp_(access|decision)$/.test(x.kind) && x.payload.name === mcpName && x.payload.groupId === gid && x.status === 'approved') || { id: 'expiry', requested_by: null, recommendations: [] };
    const members = Object.keys(USERS).filter(k => ((CAN.endpoints.find(e => e.user === USERS[k].name) || {}).group_id) === gid);
    notice([...watchers(w), ...members], w, `${mcpName} access for ${gname} expired — ask again to renew`, 'update', 'Expiry');
    notice(approversOf('decideMcp'), w, `${mcpName} access for ${gname} expired (granted by ${grantedBy || '—'})`, 'update', 'Expiry');
    if (w.history) { w.history.push({ at: Date.now(), by: 'Expiry', action: 'access expired' }); changed(w, 'Expiry'); }
  }

  current = { submit, decide, recommend, withdraw, onDirect, inbox, get, markRead, openFor, shape, expired, KINDS, TTL };
  return current;
}
