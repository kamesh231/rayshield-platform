// Calls every route in access-matrix.json as each persona against a running server and compares
// the HTTP status with the matrix (deny → 403 with the API Error shape; otherwise 2xx).
// Run: DEMO_TENANT=straits-meridian npm start, then  BASE=http://localhost:3000 node scripts/access-check.mjs
// Writes use harmless targets; the demo is reset (as Admin) at the end.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:3000';
const MX = JSON.parse(fs.readFileSync(path.join(root, 'data/tenants/straits-meridian/access-matrix.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(root, 'data/tenants/straits-meridian/canonical.json'), 'utf8'));
const PERSONAS = MX.personas;

const rahulDev = C.endpoints.find(e => e.host === 'LT-SG-2231');
const otherDev = C.endpoints.find(e => e.host === 'LT-SG-4402');
const heroSid = 'sbx_7c21e9a04b3f';
const SAMPLE = { service_id: 'claude-code', // a service on the developer's own devices, so self-scoped reads resolve
  endpoint_id: rahulDev.endpoint_id, detection_id: 'det_01JA4K9PAN1', sid: heroSid, execution_id: 'exec_01JA4K9PAN1' };
function concrete(op) {
  let p = op.path;
  if (p.startsWith('/api/devices/{id}')) p = p.replace('{id}', rahulDev.device_id);
  else if (p.startsWith('/api/control/cues/{id}')) p = p.replace('{id}', op.method === 'GET' ? 'cue_payments_v3' : op.method === 'DELETE' ? 'cue_bank_baseline' /* not assigned to a group, so deletable */ : 'cue_soc_v1');
  else if (p.startsWith('/api/control/groups/{id}')) p = p.replace('{id}', 'grp_soc');
  else if (p.startsWith('/api/control/mcp-bridge/{id}')) p = p.replace('{id}', 'mcp_slack');
  else if (p.startsWith('/api/settings/sensors/{id}')) p = p.replace('{id}', 'sase_zscaler');
  else if (p.startsWith('/api/settings/users/{id}')) p = p.replace('{id}', 'usr_arjun');
  if (op.operationId === 'setServiceStatus') return p.replace('{service_id}', 'glean');
  return p.replace(/\{([^}]+)\}/g, (_, k) => SAMPLE[k]);
}
const BODY = {
  setServiceStatus: { status: 'under_review', note: 'access check' }, createGroup: { name: 'Access check group' }, assignGroupCue: { cue_id: 'cue_soc_v1' },
  setGroupMcpPolicy: { allow: ['mcp_jira'], deny: ['mcp_slack'] }, createCue: { name: 'Access check CUE', tool: 'claude-code', scope: 'group', scope_ref: 'grp_soc', base_cue_id: 'cue_bank_baseline' },
  updateCue: { dlp_rules: ['dlp-card-pan'] }, onboardMcp: { name: 'access-check-mcp', source: 'github:example/access-check', kind: 'remote' }, decideBridgeMcp: { status: 'blocked', approved_reason: 'access check' },
  createMyMcpRequest: { name: 'jira', reason: 'access check' }, saveConsoleState: { slice: 'fleetRoles', op: 'edit', value: {} }, updateSensor: { enabled: true }, updateDirectory: { provider: 'Entra ID' }, updateConsoleUser: { role: 'security' },
};
const SKIP = new Set(['login', 'refresh', 'logout', 'resetDemo']); // auth covered by the session; reset runs last

async function login(u) { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'demo' }) }); if (!r.ok) throw new Error('login ' + u); return r.headers.get('set-cookie').split(';')[0]; }
const jar = {}; for (const p of PERSONAS) jar[p] = await login(p);
const call = async (p, method, url, body) => { const r = await fetch(BASE + url, { method, headers: { Cookie: jar[p], 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

const rows = []; let bad = 0;
const ordered = [...MX.operations.filter(o => o.method === 'GET'), ...MX.operations.filter(o => o.method !== 'GET')];
for (const op of ordered) {
  if (SKIP.has(op.operationId)) continue;
  const url = concrete(op); const cells = [];
  for (const p of PERSONAS) {
    const lv = op.access[p];
    const r = await call(p, op.method, url, BODY[op.operationId]);
    const expectDeny = lv === 'deny';
    const shapeOk = !expectDeny || (r.body && r.body.code === 'FORBIDDEN' && typeof r.body.error === 'string' && typeof r.body.request_id === 'string');
    const ok = expectDeny ? r.status === 403 && shapeOk : (r.status >= 200 && r.status < 300) || (op.operationId === 'blastRadiusDesignTimeDeprecated' && r.status === 410);
    if (!ok) bad++;
    cells.push(`${r.status}${ok ? '' : '✗'}`);
  }
  rows.push([op.operationId, `${op.method} ${url}`, ...cells]);
}
// reset: only Admin may (non-admins first so the Admin reset is the one that runs)
{ const lvl = MX.operations.find(o => o.operationId === 'resetDemo').access; const st = {};
  for (const p of [...PERSONAS.filter(x => lvl[x] === 'deny'), ...PERSONAS.filter(x => lvl[x] !== 'deny')]) st[p] = (await call(p, 'POST', '/api/demo/reset')).status;
  rows.push(['resetDemo', 'POST /api/demo/reset', ...PERSONAS.map(p => { const ok = lvl[p] === 'deny' ? st[p] === 403 : st[p] === 200; if (!ok) bad++; return st[p] + (ok ? '' : '✗'); })]); }

// ---- specific assertions from the brief
const specific = [];
const expect = (ok, label) => { specific.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) bad++; };
expect((await call('arjun', 'PATCH', '/api/control/mcp-bridge/mcp_confluence', { status: 'approved' })).status === 403, 'Security → 403 on decideBridgeMcp (approve confluence)');
for (const [m, u, label] of [['POST', '/api/demo/reset', 'reset'], ['DELETE', '/api/control/cues/cue_soc_v1', 'deleteCue'], ['POST', '/api/control/groups', 'createGroup'], ['PUT', '/api/settings/sensors/sase_zscaler', 'sensor write']]) expect((await call('priscilla', m, u, BODY.createGroup)).status === 403, `CISO → 403 on ${label}`);
const control = MX.operations.filter(o => o.path.startsWith('/api/control/'));
const devCtl = await Promise.all(control.map(o => call('rahul', o.method, concrete(o), BODY[o.operationId]).then(r => r.status)));
expect(devCtl.every(s => s === 403), `Developer → 403 on every /api/control/* route (${control.length} routes: ${[...new Set(devCtl)].join(',')})`);
const devList = (await call('rahul', 'GET', '/api/devices')).body.map(d => d.device_name).sort();
expect(JSON.stringify(devList) === JSON.stringify(['LT-SG-2231', 'vm-dev-rahul-07']), `Developer /api/devices shows only own hosts: ${devList.join(', ')}`);
const devEps = (await call('rahul', 'GET', '/api/discovery/by_endpoint')).body.map(d => d.host).sort();
expect(JSON.stringify(devEps) === JSON.stringify(['LT-SG-2231', 'vm-dev-rahul-07']), `Developer /api/discovery/by_endpoint shows only own hosts: ${devEps.join(', ')}`);
expect((await call('rahul', 'GET', '/api/devices/' + otherDev.device_id)).status === 403, 'Developer → 403 on another person’s device (LT-SG-4402)');
const devDet = (await call('rahul', 'GET', '/api/detections')).body;
expect(devDet.length > 0 && devDet.every(d => ['LT-SG-2231', 'vm-dev-rahul-07'].includes(d.host)), `Developer /api/detections only own hosts (${devDet.length} rows)`);
const cisoDet = (await call('priscilla', 'GET', '/api/detections/det_01JA4K9PAN1')).body;
expect(Object.entries(cisoDet.evidence).every(([k, v]) => k === 'type' ? v === 'sensitive_content' : v === null), 'CISO detection detail: evidence.* = null except type');
const cisoSess = (await call('priscilla', 'GET', '/api/session/' + heroSid + '/activity')).body;
expect(cisoSess.origin.initial_prompt === null, 'CISO session activity: origin.initial_prompt = null');
expect((await call('priscilla', 'GET', '/api/terminal/hello?host=LT-SG-2231')).status === 403, 'CISO → 403 on terminal');
expect((await call('arjun', 'POST', '/api/terminal/exec', { host: 'LT-SG-2231', cmd: 'demo' })).status === 403 && (await call('arjun', 'GET', '/api/terminal/hello?host=LT-SG-2231')).status === 200, 'Security terminal = read-only replay (hello 200, exec 403)');
expect((await call('rahul', 'POST', '/api/terminal/exec', { host: 'LT-SG-2231', cmd: 'whoami' })).status === 200, 'Developer terminal exec on own host = 200');
await call('weiling', 'POST', '/api/demo/reset');

const w = [26, 58, 9, 9, 9, 9];
const line = r => r.map((c, i) => String(c).padEnd(w[i])).join(' ');
console.log(line(['operationId', 'route', ...PERSONAS]));
console.log(line(['', '', 'admin', 'security', 'ciso', 'developer']));
rows.forEach(r => console.log(line(r)));
console.log('\n' + specific.join('\n'));
console.log(`\n${bad ? bad + ' MISMATCHES' : 'ALL ROUTES MATCH THE ACCESS MATRIX'} (✗ marks a status that disagrees with access-matrix.json)`);
process.exit(bad ? 1 : 0);
