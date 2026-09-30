// Builds the Straits Meridian API fixtures and console seed from ONE canonical source.
//   in : data/tenants/straits-meridian/{canonical,personas,access-matrix}.json
//   out: data/tenants/straits-meridian/api/<persona>/<METHOD>__<path>.json   ({ status, headers, body })
//        data/tenants/straits-meridian/console-seed.json                     ({ base, personas })
// Every persona view is produced by the same code (scripts/lib/tenant-api.mjs) with the persona's
// access-matrix level applied, so the four views cannot drift apart. Denied routes get 403 fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeApi } from './lib/tenant-api.mjs';
import { buildConsoleSeed } from './lib/console-seed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data/tenants/straits-meridian');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const C = read('canonical.json'), P = read('personas.json').personas, MX = read('access-matrix.json');
const api = makeApi(C, P, MX);

// Concrete ids to materialise for parameterised GET routes (the live router computes any other id
// with the same code). Hero devices + every persona's devices + every detection/service/CUE/MCP.
const HERO_HOSTS = ['LT-SG-2231', 'vm-dev-rahul-07', 'LT-SG-1187', 'LT-SG-3310', 'LT-SG-3391', 'LT-SG-4402', 'LT-SG-5120', 'LT-SG-5133', 'LT-SG-5141', 'LT-VN-0412', 'LT-VN-0419', 'vm-ci-build-214', 'vm-etl-nightly-03', 'vm-build-eph-9f2', 'MOB-IPAD-0931', 'LT-SG-0142', 'LT-SG-4710', 'LT-SG-0101'];
const heroEps = HERO_HOSTS.map(h => C.endpoints.find(e => e.host === h));
const draftId = c => c.id.replace(/_v\d+$/, '') + '_v' + c.draft.version + '_draft';
const heroSessions = [...new Set([...C.sessions.rows.filter(s => ['LT-SG-2231', 'vm-dev-rahul-07'].includes(s.host)).map(s => s.sid), 'sbx_7c21e9a04b3f', ...['clean', 'detected', 'stopped'].map(o => C.sessions.rows.find(s => s.outcome === o).sid), ...C.blast.map(b => b.session_id)])];
const IDS = {
  service_id: C.services.map(s => s.service_id),
  endpoint_id: heroEps.map(e => e.endpoint_id),
  id_device: heroEps.filter(e => e.device_id).map(e => e.device_id),
  detection_id: C.detections.map(d => d.detection_id),
  sid: heroSessions,
  id_cue: [...C.cues.map(c => c.id), ...C.cues.filter(c => c.draft).map(draftId)],
  id_cue_versions: C.cues.map(c => c.id),
  id_group: C.groups.map(g => g.id),
  id_bridge: C.bridge.map(b => b.id),
  execution_id: C.blast.map(b => b.execution_id),
};
function paramSets(op) {
  const p = op.path;
  if (!p.includes('{')) return [{}];
  if (p.startsWith('/api/devices/')) return IDS.id_device.map(id => ({ id }));
  if (p.startsWith('/api/control/cues/{id}/versions')) return IDS.id_cue_versions.map(id => ({ id }));
  if (p.startsWith('/api/control/cues/')) return (op.method === 'GET' ? IDS.id_cue : [C.cues[1].id]).map(id => ({ id }));
  if (p.startsWith('/api/control/groups/')) return IDS.id_group.map(id => ({ id }));
  if (p.startsWith('/api/control/mcp-bridge/')) return (op.method === 'GET' ? IDS.id_bridge : ['mcp_confluence']).map(id => ({ id }));
  if (p.startsWith('/api/settings/sensors/')) return [{ id: 'sase_zscaler' }];
  if (p.startsWith('/api/settings/users/')) return [{ id: 'usr_arjun' }];
  const k = (p.match(/\{([^}]+)\}/) || [])[1];
  if (IDS[k]) return (op.method === 'GET' ? IDS[k] : IDS[k].slice(0, 1)).map(v => ({ [k]: v }));
  throw new Error('no ids for ' + p);
}
const fileName = (method, p) => method + '__' + p.replace(/^\//, '').replace(/\//g, '__').replace(/[^A-Za-z0-9_.-]/g, '_') + '.json';

const apiDir = path.join(dir, 'api');
fs.rmSync(apiDir, { recursive: true, force: true });
let written = 0; const perPersona = {};
for (const persona of Object.keys(P)) {
  const out = path.join(apiDir, persona); fs.mkdirSync(out, { recursive: true }); perPersona[persona] = { 200: 0, 403: 0, other: 0 };
  for (const op of MX.operations) {
    if (['login', 'refresh', 'logout'].includes(op.operationId)) continue;
    const lv = op.access[persona];
    const isRead = op.method === 'GET';
    if (!isRead && lv !== 'deny') continue; // allowed writes are live-only (server mutates demo state)
    for (const params of paramSets(op)) {
      const concrete = op.path.replace(/\{([^}]+)\}/g, (_, n) => encodeURIComponent(params[n] ?? params.id));
      const res = isRead ? api.handle(persona, op.operationId, params) : api.forbidden(persona, op.operationId);
      if (!res) throw new Error('no handler for ' + op.operationId);
      fs.writeFileSync(path.join(out, fileName(op.method, concrete)), JSON.stringify({ operationId: op.operationId, access: lv, ...res }, null, 1));
      written++; perPersona[persona][res.status === 200 ? 200 : res.status === 403 ? 403 : 'other']++;
    }
  }
}
const seed = buildConsoleSeed(C, P);
fs.writeFileSync(path.join(dir, 'console-seed.json'), JSON.stringify(seed));
console.log('fixtures written:', written, JSON.stringify(perPersona), '· console-seed.json', (fs.statSync(path.join(dir, 'console-seed.json')).size / 1024).toFixed(0) + ' KB');
