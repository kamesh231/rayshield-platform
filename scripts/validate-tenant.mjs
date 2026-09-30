// Validates the Straits Meridian tenant (fictional): JSON, API schemas, reconciliation, references,
// and a PAN/NRIC leak scan. Run: node scripts/validate-tenant.mjs   (exit 1 on any hard failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data/tenants/straits-meridian');
const out = []; let failed = 0;
const pass = (ok, label, detail = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
const note = (label, detail) => out.push(`NOTE  ${label}${detail ? ' — ' + detail : ''}`);

// ---------------------------------------------------------------- 1. JSON validity
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') && files.push(path.join(d, e.name)));
walk(dir);
const parsed = {}; let bad = [];
for (const f of files) { try { parsed[f] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { bad.push(path.relative(root, f) + ': ' + e.message); } }
pass(!bad.length, `JSON valid (${files.length} files)`, bad.join('; '));
const read = f => parsed[path.join(dir, f)];
const C = read('canonical.json'), SEED = read('console-seed.json'), MX = read('access-matrix.json'), P = read('personas.json').personas, T = read('tenant.json');

// ---------------------------------------------------------------- 2. schema validation (AJV)
const specs = ['rayshield-console-api-v1.yml', 'rayshield-console-api-v2.2-control.yml', 'me-endpoints.yml'].map(f => ({ f, doc: yaml.load(fs.readFileSync(path.join(root, 'docs/api', f), 'utf8')) }));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv); ['int64', 'password'].forEach(n => ajv.addFormat(n, true));
specs.forEach(s => ajv.addSchema(s.doc, s.f));
const opIndex = {};
for (const s of specs) for (const [p, item] of Object.entries(s.doc.paths)) for (const [m, op] of Object.entries(item)) if (op && op.operationId) opIndex[op.operationId] = { spec: s.f, path: p, method: m, op };
const ptr = s => s.replace(/~/g, '~0').replace(/\//g, '~1');
const resolve = (doc, ref) => ref.replace(/^#\//, '').split('/').reduce((o, k) => o && o[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
const deref = (doc, sch, depth = 0) => { if (!sch || depth > 8) return sch; if (sch.$ref) return deref(doc, resolve(doc, sch.$ref), depth + 1); if (sch.allOf) return sch.allOf.map(x => deref(doc, x, depth + 1)).reduce((a, x) => ({ ...a, ...x, properties: { ...(a.properties || {}), ...(x.properties || {}) } }), {}); return sch; };
const invented = {}; // opId -> Set(field paths)
function extraKeys(doc, sch, body, at, acc) {
  sch = deref(doc, sch); if (!sch || body == null) return;
  if (Array.isArray(body)) { const it = sch.items || (sch.oneOf || []).map(x => deref(doc, x)).find(x => x.type === 'array')?.items; if (it) body.slice(0, 3).forEach(b => extraKeys(doc, it, b, at + '[]', acc)); return; }
  if (typeof body !== 'object') return;
  const props = sch.properties; if (!props) return;
  for (const k of Object.keys(body)) { if (!(k in props)) acc.add(at + k); else extraKeys(doc, props[k], body[k], at + k + '.', acc); }
}
function exampleKeys(ex, body, at, acc) {
  if (ex == null || body == null) return;
  if (Array.isArray(body)) { if (Array.isArray(ex) && ex.length) body.slice(0, 3).forEach(b => exampleKeys(ex[0], b, at + '[]', acc)); return; }
  if (typeof body !== 'object' || typeof ex !== 'object') return;
  for (const k of Object.keys(body)) { if (!(k in ex)) acc.add(at + k); else if (ex[k] && typeof ex[k] === 'object') exampleKeys(ex[k], body[k], at + k + '.', acc); }
}
const schemaErrors = {}; let checked = 0, exampleOnly = 0, noContract = 0;
for (const [f, fx] of Object.entries(parsed)) {
  if (!f.includes(path.sep + 'api' + path.sep) || !fx.operationId) continue;
  const o = opIndex[fx.operationId];
  if (!o) { noContract++; continue; }
  const res = o.op.responses && (o.op.responses[String(fx.status)] || (fx.status === 403 ? o.op.responses['403'] : null));
  const content = res && res.content && res.content['application/json'];
  let schemaRef = null;
  if (content && content.schema) schemaRef = `${o.spec}#/paths/${ptr(o.path)}/${o.method}/responses/${fx.status}/content/application~1json/schema`;
  else if (fx.status === 403) schemaRef = `${o.spec}#/components/schemas/Error`;
  const acc = invented[fx.operationId] = invented[fx.operationId] || new Set();
  if (schemaRef) {
    let v; try { v = ajv.getSchema(schemaRef) || ajv.compile({ $ref: schemaRef }); } catch (e) { (schemaErrors[fx.operationId] = schemaErrors[fx.operationId] || new Set()).add('schema compile: ' + e.message); continue; }
    checked++;
    if (!v(fx.body)) for (const e of v.errors.slice(0, 3)) (schemaErrors[fx.operationId] = schemaErrors[fx.operationId] || new Set()).add(`${e.instancePath || '/'} ${e.message}`);
    if (fx.status === 200) extraKeys(specs.find(s => s.f === o.spec).doc, content.schema, fx.body, '', acc);
  } else if (content && content.example !== undefined) { exampleOnly++; exampleKeys(content.example, fx.body, '', acc); }
  else noContract++;
}
const EXPECTED_SCHEMA_GAP = { getDetectionsSummary: 'owasp null (spec: type string, not nullable) — open item 4', getDetection: 'owasp null (spec: type string, not nullable) — open item 4', getMe: 'role ciso / developer not in the admin | security | viewer enum — open item 1' };
const errOps = Object.keys(schemaErrors);
const unexpected = errOps.filter(op => ![...schemaErrors[op]].every(m => (/owasp/.test(m) || (op === 'getMe' && /role/.test(m))) && EXPECTED_SCHEMA_GAP[op]));
pass(!unexpected.length, `fixture bodies match the YAML schemas (${checked} schema-checked, ${exampleOnly} example-only, ${noContract} with no response contract)`, unexpected.map(op => op + ': ' + [...schemaErrors[op]].join('; ')).join(' | '));
for (const op of errOps.filter(o => !unexpected.includes(o))) note(`known schema gap in ${op}`, [...schemaErrors[op]].slice(0, 2).join('; ') + ' → ' + EXPECTED_SCHEMA_GAP[op]);
const inv = Object.entries(invented).filter(([, s]) => s.size).map(([op, s]) => `${op}: ${[...s].sort().join(', ')}`);
note('fields beyond the schema (or beyond the example where the spec has only an example) — invented, additive', inv.length ? '\n        ' + inv.join('\n        ') : 'none');

// ---------------------------------------------------------------- 3. reconciliation
const svc = C.services, E = C.endpoints, D = C.detections;
const byStatus = k => svc.filter(s => s.status === k).length;
pass(svc.length === 27, 'services = 27', String(svc.length));
const governed = svc.length - byStatus('unlabelled');
pass(governed === 23, 'governed = 23 of 27', `approved ${byStatus('approved')} · beta ${byStatus('beta')} · under review ${byStatus('under_review')} · unapproved ${byStatus('unapproved')} · prohibited ${byStatus('prohibited')} · unlabelled ${byStatus('unlabelled')}`);
const hits = svc.reduce((a, s) => a + s.hits, 0), shadow = svc.filter(s => ['unapproved', 'prohibited', 'unlabelled'].includes(s.status)).reduce((a, s) => a + s.hits, 0);
const share = Math.round(shadow / hits * 1000) / 10, prev = Math.round(C.shadow_previous.shadow_hits / C.shadow_previous.hits * 1000) / 10;
pass(hits === 102110 && share === 3.1 && prev === 5.4, 'shadow share recomputed from rows = 3.1 % (prev 5.4 %)', `${shadow} / ${hits} = ${(shadow / hits * 100).toFixed(3)} %`);
pass(E.reduce((a, e) => a + e.hits, 0) === hits, 'endpoint hits sum to total AI requests', String(E.reduce((a, e) => a + e.hits, 0)));
const fam = {}; D.forEach(d => { fam[d.rule_id] = fam[d.rule_id] || [0, 0, 0, 0]; fam[d.rule_id][0]++; fam[d.rule_id][{ blocked: 1, recorded: 2, escalated: 3 }[d.disposition]]++; });
pass(D.length === 58, 'detections = 58', Object.entries(fam).map(([k, v]) => `${k} ${v[0]} (${v[1]}/${v[2]}/${v[3]})`).join(' · '));
pass(D.filter(d => d.severity === 'critical').length === 17, 'critical = 17');
pass(D.filter(d => d.disposition === 'escalated').length === 3, 'escalated = 3');
pass(D.filter(d => d.severity === 'critical' && d.disposition === 'recorded').length === 0, 'critical contained 17/17 (none only recorded)');
pass(D.filter(d => ['CARD-PAN', 'PII-NRIC'].includes(d.rule_id) && d.disposition === 'recorded').length === 0, '0 card or NRIC records left the bank');
const st = k => E.filter(e => e.agent_state === k).length;
pass(st('enforcing') + st('record_only') + st('offline') + st('no_agent') === 412 && st('enforcing') === 371 && st('record_only') === 12 && st('offline') === 9 && st('no_agent') === 20, 'fleet states sum to 412', `enforcing ${st('enforcing')} · record-only ${st('record_only')} · offline ${st('offline')} · no agent ${st('no_agent')}`);
const ty = k => E.filter(e => e.type === k).length;
pass(ty('laptop') + ty('vm') + ty('other') === 412 && ty('laptop') === 318 && ty('vm') === 78 && ty('other') === 16, 'endpoint types sum to 412', `laptops ${ty('laptop')} · VMs ${ty('vm')} · others ${ty('other')}`);
pass(Math.round(st('enforcing') / 412 * 100) === 90, '90 % endpoints enforcing', `${st('enforcing')} / 412`);
pass(E.filter(e => e.behind).length === 17, 'CUE drift = 17 (Payments 6 · Digital 9 · Data 2)', ['grp_payments_eng', 'grp_digital_eng', 'grp_data'].map(g => E.filter(e => e.behind && e.group_id === g).length).join(' · '));
pass(C.sensors.discovery[0].endpoints === 366 && C.sensors.directory.mapped_endpoints === 371, 'sensors: pcap 366 endpoints · Entra ID 371 of 412 mapped');
pass(C.groups.every(g => g.member_count === E.filter(e => e.group_id === g.id).length) && C.groups.map(g => g.member_count).join() === '47,88,36,14,29,71,22,26', 'group member counts', C.groups.map(g => g.id.slice(4) + ' ' + g.member_count).join(' · '));
pass(C.sessions.totals.total === 1934 && C.sessions.totals.clean === 1861 && C.sessions.totals.detected === 51 && C.sessions.totals.stopped === 22 && new Set(D.map(d => d.session_id)).size === 51, 'sessions 1,934 = 1,861 clean + 51 detected + 22 stopped', 'detected sessions derived from detections: ' + new Set(D.map(d => d.session_id)).size);
const U = C.usage;
pass(Math.abs(U.summary.cost_usd - 7412.88) < 0.005 && U.by_model.map(m => m.cost_usd).join() === '4608.11,1902.37,902.4', 'usage USD 7,412.88 = 4,608.11 + 1,902.37 + 902.40', String(U.summary.cost_usd));
pass(Math.abs(U.by_group.reduce((a, g) => a + g.cost, 0) - 7412.88) < 0.005 && Math.abs(U.by_user.reduce((a, u) => a + u.cost_usd, 0) - 7412.88) < 0.005, 'usage by group and by user each sum to USD 7,412.88');
pass(U.summary.users === 244 && U.summary.sessions === 1934 && U.stops.length === 22 && U.by_group.reduce((a, g) => a + g.stops, 0) === 22, 'usage 244 users · 1,934 sessions · 22 hard stops');
pass(C.blast.length === 7 && C.blast.every(b => D.some(d => d.detection_id === b.detection_id)), 'blast radius: 7 DLP-blocked executions, each tied to a detection');
// console seed agrees with canonical
const S = SEED.base;
pass(S.SERVICES.length === 27 && S.SERVICES.reduce((a, s) => a + s.daily, 0) === hits && S.ENDPOINTS.length === 412 && S.DET_ROWS.length === 58 && S.FLEET.filter(e => e.behind).length === 17 && S.FLEET.filter(e => !e.noAgent && !e.recordOnly && !e.offline).length === 371, 'console seed reconciles with canonical (services, requests, endpoints, detections, drift, enforcing)');
pass(S.RADIUS.reduce((a, r) => a + r.total, 0) === 7 && S.POLICIES.find(p => p.name === 'dlp-card-pan').hits === '6', 'console seed: 7 blast runs · dlp-card-pan hits = CARD-PAN detections (6)');
// fixtures agree
const fx = (p, f) => parsed[path.join(dir, 'api', p, f)];
const sum = fx('weiling', 'GET__api__discovery__summary.json').body;
pass(sum.services === 27 && sum.governance.unlabelled === 4 && sum.shadow_share_pct === 3.1 && sum.endpoints.total === 412, 'fixture getDiscoverySummary matches (27 · 4 unlabelled · 3.1 % · 412)');
const dsum = fx('arjun', 'GET__api__detections__summary.json').body.totals;
pass(dsum.detections === 58 && dsum.critical === 17 && dsum.escalated === 3, 'fixture getDetectionsSummary matches (58 · 17 · 3)');
const fl = fx('weiling', 'GET__api__devices__summary.json').body;
pass(fl.enforcing === 371 && fl.record_only === 12 && fl.offline === 9 && fl.no_agent === 20, 'fixture getFleetSummary matches');
pass(fx('weiling', 'GET__api__discovery__by_service.json').headers['X-Total-Count'] === '27' && fx('weiling', 'GET__api__sessions.json').headers['X-Total-Count'] === '1934', 'X-Total-Count headers (services 27, sessions 1934)');

// ---------------------------------------------------------------- 4. referential integrity
const ids = { group: new Set(C.groups.map(g => g.id)), mcp: new Set(C.bridge.map(b => b.id)), cue: new Set(C.cues.map(c => c.id)), device: new Set(E.map(e => e.device_id).filter(Boolean)), endpoint: new Set(E.map(e => e.endpoint_id)), session: new Set(C.sessions.rows.map(s => s.sid)), detection: new Set(D.map(d => d.detection_id)) };
const missing = [];
const chk = (kind, v, where) => { if (v != null && !ids[kind].has(v)) missing.push(`${kind} ${v} (${where})`); };
E.forEach(e => chk('group', e.group_id, 'endpoint ' + e.host));
D.forEach(d => { chk('device', d.device_id, d.detection_id); chk('endpoint', d.endpoint_id, d.detection_id); chk('session', d.session_id, d.detection_id); chk('group', d.group_id, d.detection_id); });
C.sessions.rows.forEach(s => { chk('device', s.device_id, s.sid); chk('group', s.group_id, s.sid); });
C.groups.forEach(g => { chk('cue', g.assigned_cue_id, g.id); [...g.mcp_allow].forEach(n => { if (!C.bridge.some(b => b.name === n)) missing.push(`mcp ${n} (allow of ${g.id})`); }); });
C.cues.forEach(c => { chk('cue', c.base_cue_id, c.id); chk('group', c.group_id, c.id); c.mcp_servers.forEach(n => { if (!C.bridge.some(b => b.name === n && b.status === 'approved')) missing.push(`onboarded mcp ${n} (cue ${c.id})`); }); });
C.mcp_discovered.forEach(m => { chk('endpoint', m.endpoint_id, 'mcp ' + m.name); if (m.bridge_state !== 'unonboarded') chk('mcp', m.mcp_id, 'discovered ' + m.name); });
C.skills.forEach(s => chk('endpoint', s.endpoint_id, 'skill ' + s.name));
C.blast.forEach(b => { chk('detection', b.detection_id, b.execution_id); chk('session', b.session_id, b.execution_id); chk('cue', b.cue_id, b.execution_id); });
U.stops.forEach(s => { chk('session', s.sid, 'stop'); chk('group', s.group_id, 'stop'); });
U.by_user.forEach(u => chk('group', u.group_id, 'usage ' + u.person));
for (const r of S.DET_ROWS) if (!ids.detection.has(r[0]) || !ids.session.has(r[1])) missing.push('seed DET_ROW ' + r[0]);
pass(!missing.length, 'every group / mcp / cue / device / session / detection id referenced exists', missing.slice(0, 8).join('; '));
pass(MX.operations.length === Object.keys(opIndex).length || MX.operations.every(o => opIndex[o.operationId] || ['login'].includes(o.operationId)), `access matrix covers the spec operations (${MX.operations.length} operations, all in a YAML)`, MX.operations.filter(o => !opIndex[o.operationId]).map(o => o.operationId).join(', '));
const specOps = Object.keys(opIndex).filter(k => !MX.operations.some(o => o.operationId === k));
pass(!specOps.length, 'every YAML operation appears in the access matrix', specOps.join(', '));

// ---------------------------------------------------------------- 5. privacy scans
const PAN = /\b(?:\d[ -]?){15}\d\b/g, NRIC = /\b[STFGM]\d{7}[A-Z]\b/g;
const luhn = s => { const d = s.replace(/\D/g, ''); let t = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } t += n; } return t % 10 === 0; };
const scan = [...files, path.join(root, 'public/console-bank/bridge-bank.js'), path.join(root, 'src/terminals/straits-meridian.js')];
const leaks = [];
for (const f of scan) { const txt = fs.readFileSync(f, 'utf8'); for (const m of txt.match(PAN) || []) if (luhn(m) && m.replace(/\D/g, '').length === 16) leaks.push(path.relative(root, f) + ': PAN ' + m); for (const m of txt.match(NRIC) || []) leaks.push(path.relative(root, f) + ': NRIC ' + m); }
pass(!leaks.length, `no unmasked 16-digit PAN (Luhn) or full NRIC in ${scan.length} files`, leaks.slice(0, 5).join('; '));
const redDet = fx('priscilla', 'GET__api__detections__det_01JA4K9PAN1.json').body;
pass(Object.entries(redDet.evidence).every(([k, v]) => k === 'type' ? !!v : v === null) && redDet.chain.every(c => c.detail === null) && redDet.teaser === 'Card number (PAN) in agent context · MCP tool result → model prompt', 'CISO detection detail: evidence.* null except type; chain detail null; teaser = rule label + target type');
const fictional = /\b(DBS|OCBC|UOB|Standard Chartered|Maybank|Citibank|HSBC|SG Bank)\b/;
const brands = files.filter(f => fictional.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(root, f));
pass(!brands.length, 'no real bank brand names in tenant data', brands.slice(0, 3).join(', '));
pass(T.fictional === true && T.footer === 'Demo data · fictional' && /straitsmeridian\.example/.test(JSON.stringify(C.meta)), 'tenant marked fictional · footer "Demo data · fictional" · domain straitsmeridian.example');

console.log(out.join('\n'));
console.log(`\n${failed ? failed + ' FAILED' : 'ALL PASSED'} (${out.filter(l => l.startsWith('PASS')).length} passed, ${out.filter(l => l.startsWith('NOTE')).length} notes)`);
process.exit(failed ? 1 : 0);
