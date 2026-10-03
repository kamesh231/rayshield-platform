// Scripted endpoint terminals for the Straits Meridian Bank tenant (fictional).
// Nothing executes: commands return canned output and emit the same console events the real
// Aegis agent would. Data (CUE, DLP rules, MCP servers, SPIFFE ids) comes from canonical.json.
import crypto from 'node:crypto';
import { getState, emit } from '../state.js';
import { BANK } from '../tenants/index.js';
import { workflows } from '../workflows.js';

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', blu: '\x1b[34m', mag: '\x1b[35m', cyn: '\x1b[36m', gry: '\x1b[90m' };
const A = `${C.cyn}aegis ▸${C.r}`, OK = `${C.grn}✓${C.r}`;
const BLOCK = t => `${C.red}${C.b}BLOCKED${C.r}${C.red} — ${t}${C.r}`;
const line = (s = '') => s + '\r\n';
const sid = () => 'sbx_' + crypto.randomBytes(6).toString('hex');
const CAN = () => BANK.canonical;
const DOMAIN = () => CAN().meta.domain;
const ago = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const expLabel = ms => { const m = Math.max(1, Math.round((ms - Date.now()) / 60000)); return 'expires in ' + (m < 60 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' days'); };
const PAN = '4539 •••• •••• 1187', NRIC = 'S•••••••D';

export const HOSTS = {
  'LT-SG-2231': { label: 'LT-SG-2231 — Rahul Iyer · MacBook Pro', owner: 'Rahul Iyer', user: 'rahul.iyer', cwd: '~/src/settlement-recon', sandbox: 'libkrun', tools: ['claude-code', 'gemini-cli'] },
  'vm-dev-rahul-07': { label: 'vm-dev-rahul-07 — Rahul Iyer · dev VM', owner: 'Rahul Iyer', user: 'rahul.iyer', cwd: '~/src/settlement-recon', sandbox: 'firecracker', tools: ['claude-code'] },
};
const spiffe = () => `spiffe://${DOMAIN()}/user/rahul.iyer`;
const payCue = () => CAN().cues.find(c => c.id === 'cue_payments_v3');
const baseCue = () => CAN().cues.find(c => c.id === 'cue_bank_baseline');
const ver = () => getState().bank.payCueVersion;
const confluenceOk = () => { const b = getState().bank; return (b.bridge.mcp_confluence || {}).status === 'approved' && ((b.groupPolicy.grp_payments_eng || {}).mcp_allow || []).includes('confluence'); };

// Detections raised here land in the minutes before the frozen "now" (10:00 SGT) so they sort first.
function liveStamp() {
  const b = getState().bank; const k = Math.min(b.liveN, 8); b.liveN++;
  const ts = CAN().meta.now - 110 + k * 12; const d = new Date((ts + CAN().meta.display_offset_s) * 1000);
  const p = n => String(n).padStart(2, '0');
  return { ts, raw: `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`, hm: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

const SCRIPT = [
  ['aegis run claude-code --src ./settlement-recon --writable', 'Boot a sandboxed Claude Code under the Payments Engineering CUE'],
  ['claude "find why yesterday\'s card settlement is off by SGD 1,240"', 'postgres-mcp query → DLP stops card PAN + NRIC before the prompt leaves'],
  ['aegis mcp request confluence --reason "read runbooks while debugging settlement"', 'Ask for the confluence MCP server (Admin or CISO decides)'],
  ['claude "open the runbook for settlement retries"', 'Needs confluence — blocked until it is approved'],
  ['claude "summarise today\'s settlement exceptions"', 'After Payments CUE v4: query results arrive masked, task succeeds'],
];
function demoList() {
  let out = line(`${C.b}Scripted commands — Straits Meridian Bank (fictional)${C.r}`);
  SCRIPT.forEach(([cmd, desc], i) => { out += line(`  ${C.cyn}${String(i + 1).padStart(2)}${C.r}  ${C.b}${cmd}${C.r}`); out += line(`      ${C.gry}${desc}${C.r}`); });
  return out + line('') + line(`${C.gry}Run them in order for the storyline. Type ${C.r}${C.b}clear${C.r}${C.gry} to clear the screen.${C.r}`);
}
function banner(h) {
  return [`${C.d}RayShield Aegis endpoint — ${h.label}${C.r}`, `${C.d}sandbox: ${h.sandbox} · identity: ${spiffe()}${C.r}`, `${C.d}Demo data · fictional. Type ${C.r}${C.b}demo${C.r}${C.d} to list the scripted commands.${C.r}`, ''].map(line).join('');
}

function h_run(h) {
  const b = getState().bank; b.sandbox[h.hostId] = true;
  const pc = payCue(), bc = baseCue(), v = b.syncedVersion[h.hostId] || ver();
  const own = pc.own_egress, dlp = [...bc.dlp_rules, ...(v >= 4 ? ['dlp-mask-query-results'] : [])];
  emit({ type: 'terminal', host: h.hostId, kind: 'session-start', cueVersion: v });
  return { out:
    line(`${A} resolving CUE for ${C.b}${h.user}${C.r} (Engineering — Payments) …`) +
    line(`${A} claude-code/payments-eng@v${v} ${C.grn}(signed · ed25519 · aegis-smb-2026-09)${C.r} — server-verified`) +
    line(`     inherits ${C.b}Bank baseline v${bc.version}${C.r} ${C.gry}(inherited fields are locked)${C.r}`) +
    line(`${A} booting ${h.sandbox} sandbox ${C.gry}${sid()}${C.r}`) +
    line(`     ${OK} egress (inherited from Bank baseline): ${bc.egress_allow.join(', ')}`) +
    line(`     ${OK} egress (Payments): ${own.join(', ')}`) +
    line(`     ${OK} DLP ${C.b}Enforce${C.r}: ${dlp.join(', ')}${v >= 4 ? '' : ` ${C.gry}(inherited from Bank baseline)${C.r}`}`) +
    line(`     ${OK} MCP via Aegis Bridge: ${pc.mcp_servers.join(', ')}${confluenceOk() ? ', confluence' : ''}`) +
    line(`     ${OK} writable path (runtime --src/--writable, not part of the CUE): ./settlement-recon`) +
    line(`     ${OK} identity signed: ${spiffe()}`) +
    line(`${A} agent ready.`) };
}

function needSandbox(h) { return getState().bank.sandbox[h.hostId] ? null : { out: line(`${C.yel}No sandbox yet.${C.r} Run ${C.b}aegis run claude-code --src ./settlement-recon --writable${C.r} first.`) }; }

function h_settlement(h, cmd) {
  const pre = needSandbox(h); if (pre) return pre;
  const b = getState().bank;
  if (ver() >= 4 && (b.syncedVersion[h.hostId] || 0) >= 4) {
    emit({ type: 'terminal', host: h.hostId, kind: 'agent-task', task: 'settlement (masked)' });
    b.rahulSpendExtra += 0.42;
    return { out:
      line(`${C.mag}claude${C.r} working…`) +
      line(`  mcp    postgres-mcp.query via Aegis Bridge ${C.gry}(sandbox sbx-pg-7c21)${C.r}`) +
      line(`  sql    SELECT batch_id, txn_id, pan, nric, amount FROM cards.txn_ledger WHERE settle_date = current_date - 1`) +
      line(`  ${A} ${C.b}dlp-mask-query-results${C.r} masked 2 columns before the result reached the model`) +
      line(`         pan → ${C.gry}${PAN}${C.r}   nric → ${C.gry}${NRIC}${C.r}`) +
      line(`  net    api.anthropic.com ${C.grn}allowed${C.r} ${C.gry}(masked context only)${C.r}`) +
      line(`${OK} ${/exception/i.test(cmd) ? '3 settlement exceptions today: 2 duplicate FAST reversals, 1 late SWIFT MT103 confirmation.' : 'Found it: batch B-0927-04 double-counted a SGD 1,240.00 reversal. Suggested fix in recon/batch.py.'}`) +
      line(`${C.gry}No detection — nothing sensitive left the sandbox.${C.r}`) };
  }
  // Before v4: DLP blocks the prompt that carries the raw query result.
  const st = liveStamp(); const rowId = 'det_01JA4L' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5); const session = sid();
  const detected = /exception/i.test(cmd) ? 'cards.txn_ledger · 86 rows with PAN + NRIC columns' : 'cards.txn_ledger · 1,240 rows with PAN + NRIC columns';
  const teaser = `${detected} → api.anthropic.com (blocked before transmission)`;
  const evidence = { type: 'sensitive_content', teaser, content: { path: 'postgres-mcp · query result (cards.txn_ledger)', basis: detected + ' in the tool result headed to api.anthropic.com', pat: 'Luhn-valid 16-digit PAN · NRIC checksum', snippet: `txn_id=TX-88${st.hm.replace(':', '')}, pan=${PAN}, nric=${NRIC}` }, exfil: null, undis: null, signature: 'aegis-smb-2026-09 · live' };
  const run = { id: 'exec_' + rowId.slice(4), detection_id: rowId, when: 'Today ' + st.hm, mcp: 'postgres-mcp', sbx: 'sbx-pg-7c21', cred: 'Read DATABASE_URL from .env in ~/src/settlement-recon', credShort: 'creds · .env credentials', action: 'SELECT * FROM cards.txn_ledger WHERE settle_date = current_date - 1', data: detected.replace(' with PAN + NRIC columns', ''), dlp: 'Card PAN + NRIC', dlpLong: `Flagged card PANs (e.g. ${PAN}) and NRICs (e.g. ${NRIC}) in the tool result headed to api.anthropic.com. Blocked before it left the sandbox.` };
  const e = CAN().endpoints.find(x => x.host === h.hostId);
  const apiRow = { detection_id: rowId, ts: st.ts, rule_id: 'CARD-PAN', rule_label: 'Card number (PAN) in agent context', severity: 'critical', disposition: 'blocked', device_id: e.device_id, endpoint_id: e.endpoint_id, host: e.host, owner: e.user, owner_kind: 'person', department: e.department, group_id: e.group_id, session_id: session, teaser, target_type: 'MCP tool result → model prompt',
    evidence: { type: 'sensitive_content', decoded_command: null, sensitive_content: { path: evidence.content.path, basis: evidence.content.basis, pattern: evidence.content.pat, snippet_redacted: evidence.content.snippet }, exfil: null, egress_spike: null, persistence: null, undisclosed_action: null }, chain_extra: [], tool: 'claude-code', fix_hint: null };
  b.extraDetections.unshift(apiRow);
  emit({ type: 'detection', host: h.hostId, detHost: h.hostId, rowId, sid: session, rule: 'CARD-PAN', ruleIndex: 0, disposition: 'b', rawTs: st.raw, severity: 'critical', teaser, evidence, run });
  return { out:
    line(`${C.mag}claude${C.r} working…`) +
    line(`  mcp    postgres-mcp.query via Aegis Bridge ${C.gry}(credentials from .env)${C.r}`) +
    line(`  sql    SELECT * FROM cards.txn_ledger WHERE settle_date = current_date - 1`) +
    line(`  result ${detected}`) +
    line(`${A} ${C.b}Protect / DLP${C.r} inspected the next prompt before it left the sandbox`) +
    line(BLOCK('card PAN + NRIC in the tool result (dlp-card-pan, dlp-nric · Enforce)')) +
    line(`     match:  ${C.gry}${PAN}${C.r} · ${C.gry}${NRIC}${C.r} (masked at source)`) +
    line(`     dest:   api.anthropic.com — nothing transmitted`) +
    line(`     action: prompt stopped, event signed (ed25519 · aegis-smb-2026-09)`) +
    line(`${C.gry}Why and how to fix: open ${C.r}${C.b}/me${C.r}${C.gry} → My blocked events. Security sees ${rowId} in Protect → Detections.${C.r}`) };
}

function h_request(h, cmd, who) {
  const b = getState().bank;
  const reason = (cmd.match(/--reason\s+"([^"]+)"/) || cmd.match(/--reason\s+(.+)$/) || [])[1] || 'read runbooks while debugging settlement';
  const bc = b.bridge.mcp_confluence || {};
  if (bc.suspended) return { out: line(`${A} confluence is ${C.red}suspended${C.r} by ${bc.suspended_by} for every group. Ask the SOC or your admin why.`) };
  if (confluenceOk()) { const g = ((b.mcpGrants || {}).grp_payments_eng || {}).confluence; return { out: line(`${A} confluence is already approved for Engineering — Payments${g && g.expires_at ? ` (${expLabel(g.expires_at)})` : ''}. Try: ${C.b}claude "open the runbook for settlement retries"${C.r}`) }; }
  if (bc.status === 'blocked') return { out: line(`${A} confluence was blocked by ${bc.approved_by}. Reason: ${bc.approved_reason || '—'}`) };
  if (bc.status === 'approved') { // approved in the Bridge but the group's access expired or was removed: ask for a renewal
    const W = workflows(), r = W && who ? W.submit(who, { kind: 'mcp_access', name: 'confluence', reason, via: 'terminal' }) : null;
    return { out: line(`${A} requesting ${C.b}renewed${C.r} access to confluence for Engineering — Payments`) + line(`     reason: “${reason}”`) +
      line(`     status: ${C.yel}${C.b}awaiting decision${C.r} — Tan Wei Ling (Admin) or Priscilla Goh (CISO)${r && r.status === 200 ? ` · request ${r.body.id}` : ''}`) + line(`     inbox:  ${OK} Tan Wei Ling and Priscilla Goh notified`) }; }
  if (!b.myRequests.some(r => r.name === 'confluence')) b.myRequests.push({ by: 'rahul', name: 'confluence', reason, at: Date.now(), via: 'terminal' });
  emit({ type: 'mcpRequest', mcpId: 'm-confluence', bridgeId: 'mcp_confluence', name: 'confluence', by: 'Rahul Iyer', host: h.hostId, reason, tool: 'claude-code', role: 'payments-eng' });
  // Attach to the open approval request (seeded 3 h ago from /me); the approvers get an inbox notice.
  const W = workflows(), before = W && W.openFor('mcp:mcp_confluence');
  const r = W && who && who.id === 'rahul' ? W.submit(who, { kind: 'mcp_access', name: 'confluence', reason, via: 'terminal' }) : null;
  const wf = r && r.status === 200 ? r.body : null;
  return { out:
    line(`${A} requesting MCP server ${C.b}confluence${C.r} for Engineering — Payments`) +
    line(`     reason: “${reason}”`) +
    line(`     ${C.gry}${before ? `request ${before.id} (opened ${ago(before.requested_at)} from /me) — your terminal request is attached` : wf ? `request ${wf.id} opened` : 'MCP Bridge: confluence'}${C.r}`) +
    line(`     scan:   ${C.yel}scanning…${C.r} ${OK} passed · read-only (search, get_page) · risk low`) +
    line(`     status: ${C.yel}${C.b}awaiting decision${C.r} — Tan Wei Ling (Admin) or Priscilla Goh (CISO)`) +
    line(`     inbox:  ${OK} Tan Wei Ling and Priscilla Goh notified${wf && wf.recommendations.length ? ` · ${wf.recommendations.map(x => x.by + ' recommends ' + (x.recommendation === 'block' ? 'blocking' : 'approval')).join(' · ')}` : ''}`) +
    line(`${C.gry}Track it on /me → Inbox. The terminal announces the decision.${C.r}`) };
}

function h_runbook(h) {
  const pre = needSandbox(h); if (pre) return pre;
  if (!confluenceOk()) {
    emit({ type: 'terminal', host: h.hostId, kind: 'mcp-blocked', server: 'confluence' });
    return { out:
      line(`${C.mag}claude${C.r} wants MCP ${C.b}confluence${C.r} …`) +
      line(BLOCK('MCP server "confluence" is not allowed for Engineering — Payments')) +
      line(`     Aegis only exposes MCP servers onboarded in the MCP Bridge and allowed by your group policy.`) +
      line(`     ${C.gry}Run ${C.r}${C.b}aegis mcp request confluence --reason "…"${C.r}${C.gry} and wait for an Admin or CISO decision.${C.r}`) };
  }
  emit({ type: 'terminal', host: h.hostId, kind: 'agent-task', task: 'runbook' });
  return { out:
    line(`${C.mag}claude${C.r} via MCP ${C.b}confluence${C.r} ${C.grn}(approved · Engineering — Payments)${C.r}`) +
    line(`  confluence.search "settlement retries" → 2 pages`) +
    line(`  confluence.get_page "Runbook — card settlement retries (PAY-RB-014)"`) +
    line(`   1. Pause settlement-recon for the affected batch`) +
    line(`   2. Re-run reconciliation with --batch <id> --dry-run`) +
    line(`   3. Raise a reversal only after Treasury Ops confirms`) +
    line(`${OK} MCP call stayed inside the Aegis Bridge sandbox.`) };
}

const MATCHERS = [
  [/^aegis\s+run/i, h_run],
  [/^aegis\s+mcp\s+request\s+confluence/i, h_request],
  [/runbook|confluence/i, h_runbook],
  [/settlement.*(off|exception)|exception|1,?240/i, h_settlement],
];

export function runCommand(hostId, raw, who) {
  if (!HOSTS[hostId]) return { out: line(`${C.red}unknown host${C.r}`) };
  const h = { ...HOSTS[hostId], hostId };
  const cmd = (raw || '').trim();
  if (!cmd) return { out: '' };
  let res;
  if (/^demo$/i.test(cmd)) res = { out: demoList() };
  else if (/^(help|\?)$/i.test(cmd)) res = { out: line(`Scripted demo shell. Type ${C.b}demo${C.r} for the storyline commands.`) };
  else if (/^clear$/i.test(cmd)) return { out: '\x1b[2J\x1b[H' + banner(h) };
  else if (/^(whoami|id)$/i.test(cmd)) res = { out: line(`${h.user} — ${h.owner} — Engineering — Payments — ${spiffe()}`) };
  else { const m = MATCHERS.find(([re]) => re.test(cmd)); res = m ? m[1](h, cmd, who) : { out: line(`${C.gry}${cmd}: not one of the scripted commands. Type ${C.r}${C.b}demo${C.r}${C.gry}.${C.r}`) }; }
  const t = getState().bank.transcript; (t[hostId] = t[hostId] || []).push({ cmd, out: res.out });
  return res;
}

export function terminalHello(hostId, replay) {
  const h = { ...HOSTS[hostId], hostId };
  let out = banner(h);
  if (replay) {
    const t = getState().bank.transcript[hostId] || [];
    out += line(`${C.yel}Read-only replay${C.r} ${C.gry}— ${t.length} command${t.length === 1 ? '' : 's'} on ${hostId} since reset. You cannot type on this endpoint.${C.r}`) + line('');
    for (const x of t) out += line(`${C.grn}${h.user}${C.r}@${C.blu}${hostId}${C.r}$ ${x.cmd}`) + x.out;
  }
  return out;
}

export function cuePushMessage(v) { return `signed CUE claude-code/payments-eng@v${v} pushed — adds dlp-mask-query-results (query results are masked before they reach the model)`; }
export const promptFor = h => `${h}`;
