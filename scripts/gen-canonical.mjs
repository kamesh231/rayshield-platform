// Generates data/tenants/straits-meridian/canonical.json — the single source of truth for the
// Straits Meridian Bank demo tenant (fictional). Hand-authored facts live in this file; everyone
// else is generated deterministically from a seeded RNG, so re-running gives identical output.
// Run: node scripts/gen-canonical.mjs   (build-tenant-fixtures.mjs then derives every persona view)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'data/tenants/straits-meridian/canonical.json');

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20260928);
const pick = (arr, r = R) => arr[Math.floor(r() * arr.length)];
const hex = (n, r = R) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
const ULID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulid = (n, r = R) => Array.from({ length: n }, () => ULID[Math.floor(r() * 32)]).join('');
const uuid = (r = R) => `${hex(8, r)}-${hex(4, r)}-4${hex(3, r)}-${'89ab'[Math.floor(r() * 4)]}${hex(3, r)}-${hex(12, r)}`;

// ---- time -------------------------------------------------------------------------------------
const NOW = 1790560800;               // Mon 28 Sep 2026 10:00 SGT (02:00 UTC)
const DAY = 86400, H = 3600;
const FROM = NOW - 7 * DAY;
const SGT = 8 * H;                     // console shows SGT wall-clock (it renders with UTC getters)
const DOMAIN = 'straitsmeridian.example';

// ---- groups -------------------------------------------------------------------------------------
// console_id is the short id the console uses in CUE refs (tool/group@vN); id is the API id.
const GROUPS = [
  { id: 'grp_payments_eng', console_id: 'payments-eng', name: 'Engineering — Payments', member_count: 47, laptops: 41, vms: 6, cue: 'cue_payments_v3', older: 6, mcp_allow: ['postgres-mcp', 'github-enterprise', 'jira'], mcp_deny: ['slack', 'filesystem'], owner: 'Tan Wei Ling', desc: 'Engineers on card settlement, FAST/PayNow and SWIFT services.', tools: ['claude-code'] },
  { id: 'grp_digital_eng', console_id: 'digital-eng', name: 'Engineering — Digital Banking', member_count: 88, laptops: 80, vms: 8, cue: 'cue_digital_v2', older: 9, mcp_allow: ['github-enterprise', 'jira'], mcp_deny: ['postgres-mcp', 'slack', 'filesystem'], owner: 'Tan Wei Ling', desc: 'Mobile and internet banking engineers.', tools: ['claude-code'] },
  { id: 'grp_data', console_id: 'data', name: 'Data & Analytics', member_count: 36, laptops: 30, vms: 6, cue: 'cue_data_v2', older: 2, mcp_allow: ['warehouse-mcp', 'jira'], mcp_deny: ['postgres-mcp', 'slack'], owner: 'Tan Wei Ling', desc: 'Analysts and data engineers on the customer_360 warehouse.', tools: ['gemini-cli', 'claude-code'] },
  { id: 'grp_soc', console_id: 'soc', name: 'Cyber Defence (SOC)', member_count: 14, laptops: 14, vms: 0, cue: 'cue_soc_v1', older: 0, mcp_allow: ['jira'], mcp_deny: ['slack'], owner: 'Arjun Menon', desc: 'Security operations and incident response.', tools: ['claude-code'] },
  { id: 'grp_treasury', console_id: 'treasury', name: 'Treasury & Markets', member_count: 29, laptops: 29, vms: 0, cue: null, older: 0, mcp_allow: [], mcp_deny: ['postgres-mcp', 'warehouse-mcp', 'slack', 'filesystem'], owner: 'Priscilla Goh', desc: 'Treasury, FX and markets desks. No agent CUE assigned.', tools: [] },
  { id: 'grp_retail_ops', console_id: 'retail-ops', name: 'Retail Banking Operations', member_count: 71, laptops: 71, vms: 0, cue: null, older: 0, mcp_allow: [], mcp_deny: ['postgres-mcp', 'warehouse-mcp', 'slack'], owner: 'Priscilla Goh', desc: 'Branch and contact-centre operations. No agent CUE assigned.', tools: [] },
  { id: 'grp_contractors', console_id: 'contractors', name: 'Vendor Engineering (contractors)', member_count: 22, laptops: 22, vms: 0, cue: 'cue_contractors_v1', older: 0, mcp_allow: ['github-enterprise'], mcp_deny: ['postgres-mcp', 'warehouse-mcp', 'slack', 'filesystem'], owner: 'Tan Wei Ling', desc: 'External engineers on the mobile app vendor contract. Recertification due in 14 days.', tools: ['codex-cli'], recert_due: NOW + 14 * DAY },
  { id: 'grp_svc', console_id: 'svc', name: 'Service accounts (CI / ETL)', member_count: 26, laptops: 0, vms: 26, cue: null, older: 0, mcp_allow: ['github-enterprise'], mcp_deny: ['slack'], owner: 'Tan Wei Ling', desc: 'Build agents and nightly ETL jobs.', tools: ['claude-code'] },
];
const G = Object.fromEntries(GROUPS.map(g => [g.id, g]));

// ---- named people ---------------------------------------------------------------------------------
const NAMED = [
  { name: 'Tan Wei Ling', group: null, title: 'Platform Administrator, Technology Risk', devices: [{ host: 'LT-SG-0142', type: 'laptop', os: 'macOS 15.0' }] },
  { name: 'Arjun Menon', group: 'grp_soc', title: 'SOC Lead, Cyber Defence', devices: [{ host: 'LT-SG-4710', type: 'laptop', os: 'macOS 15.0' }] },
  { name: 'Priscilla Goh', group: null, title: 'Chief Information Security Officer', devices: [{ host: 'LT-SG-0101', type: 'laptop', os: 'macOS 15.0' }] },
  { name: 'Rahul Iyer', group: 'grp_payments_eng', title: 'Senior Engineer, Payments', devices: [{ host: 'LT-SG-2231', type: 'laptop', os: 'macOS 15.0 · MacBook Pro', tools: ['claude-code', 'gemini-cli'] }, { host: 'vm-dev-rahul-07', type: 'vm', os: 'Ubuntu 24.04', tools: ['claude-code'] }] },
  { name: 'Nur Aisyah', group: 'grp_digital_eng', title: 'Engineer, Digital Banking', devices: [{ host: 'LT-SG-1187', type: 'laptop', os: 'macOS 14.6' }] },
  { name: 'Marcus Lee', group: 'grp_digital_eng', title: 'Engineer, Digital Banking', devices: [{ host: 'LT-SG-3310', type: 'laptop', os: 'macOS 15.0' }] },
  { name: 'Daniel Koh', group: 'grp_digital_eng', title: 'Engineer, Digital Banking', devices: [{ host: 'LT-SG-3391', type: 'laptop', os: 'Ubuntu 24.04', agent_state: 'record_only' }] },
  { name: 'Jia Hui Ong', group: 'grp_data', title: 'Data Engineer', devices: [{ host: 'LT-SG-4402', type: 'laptop', os: 'macOS 15.0', tools: ['gemini-cli', 'claude-code'] }] },
  { name: 'Benjamin Chua', group: 'grp_treasury', title: 'Treasury Operations Analyst', devices: [{ host: 'LT-SG-5120', type: 'laptop', os: 'macOS 14.6', tools: ['claude-desktop'] }] },
  { name: 'Hannah Lim', group: 'grp_treasury', title: 'FX Analyst', devices: [{ host: 'LT-SG-5133', type: 'laptop', os: 'Windows 11' }] },
  { name: 'Kenji Watanabe', group: 'grp_treasury', title: 'Rates Trader', devices: [{ host: 'LT-SG-5141', type: 'laptop', os: 'Windows 11', agent_state: 'offline' }] },
  { name: 'Thanh Nguyen', group: 'grp_contractors', title: 'Contract Engineer (vendor)', devices: [{ host: 'LT-VN-0412', type: 'laptop', os: 'Ubuntu 22.04' }] },
  { name: 'Minh Pham', group: 'grp_contractors', title: 'Contract Engineer (vendor)', devices: [{ host: 'LT-VN-0419', type: 'laptop', os: 'Ubuntu 22.04' }] },
];
const NAMED_SVC = [
  { host: 'vm-ci-build-214', owner: 'svc-ci', group: 'grp_svc' },
  { host: 'vm-etl-nightly-03', owner: 'svc-etl', group: 'grp_svc' },
];

// Fictional name pools (no real people intended).
const FIRST = ['Wei Jie', 'Mei Ling', 'Siti', 'Aravind', 'Hui Min', 'Farhan', 'Kavitha', 'Jun Hao', 'Xin Yi', 'Ravi', 'Nurul', 'Chloe', 'Ethan', 'Isaac', 'Rachel', 'Darren', 'Joanne', 'Faizal', 'Deepa', 'Wen Hui', 'Bryan', 'Shu Fen', 'Ahmad', 'Lakshmi', 'Vincent', 'Grace', 'Zhi Hao', 'Aisha', 'Kelvin', 'Yuki', 'Sheng', 'Priyanka', 'Hafiz', 'Min Jun', 'Serena', 'Clement', 'Nadia', 'Terence', 'Li Ting', 'Harith'];
const LAST = ['Tan', 'Lim', 'Ng', 'Wong', 'Chan', 'Teo', 'Yeo', 'Ho', 'Low', 'Sim', 'Rahman', 'Ismail', 'Pillai', 'Nair', 'Krishnan', 'Kumar', 'Singh', 'Hassan', 'Abdullah', 'Chong', 'Foo', 'Seah', 'Quek', 'Toh', 'Loh', 'Ang', 'Kwok', 'Tay', 'Lau', 'Soh'];
const VN_FIRST = ['Quang', 'Linh', 'Tuan', 'Hoa', 'Duc', 'Mai', 'Khanh', 'Trang', 'Bao', 'Phuong'];
const VN_LAST = ['Tran', 'Le', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo'];
const usedNames = new Set(NAMED.map(p => p.name));
function newName(vn) {
  for (;;) { const n = vn ? `${pick(VN_FIRST)} ${pick(VN_LAST)}` : `${pick(FIRST)} ${pick(LAST)}`; if (!usedNames.has(n)) { usedNames.add(n); return n; } }
}
const emailOf = n => n.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.') + '@' + DOMAIN;

// ---- endpoints ---------------------------------------------------------------------------------
const usedHosts = new Set([...NAMED.flatMap(p => p.devices.map(d => d.host)), ...NAMED_SVC.map(s => s.host), 'vm-build-eph-9f2', 'MOB-IPAD-0931']);
function newHost(kind, prefix) {
  for (;;) {
    const h = kind === 'laptop' ? `${prefix || 'LT-SG'}-${String(1000 + Math.floor(R() * 8999)).padStart(4, '0')}` : kind === 'ipad' ? `MOB-IPAD-${String(1000 + Math.floor(R() * 8999))}` : prefix + '-' + String(10 + Math.floor(R() * 89));
    if (!usedHosts.has(h)) { usedHosts.add(h); return h; }
  }
}
const people = [];   // every identity with a device or usage
const endpoints = [];
const ipSeen = new Set();
function ip(prefix) { for (;;) { const v = `${prefix}.${Math.floor(R() * 60)}.${2 + Math.floor(R() * 250)}`; if (!ipSeen.has(v)) { ipSeen.add(v); return v; } } }
function addEndpoint(e) {
  const type = e.type;
  const o = {
    endpoint_id: 'ep_' + e.host, device_id: e.noAgent ? null : uuid(), host: e.host,
    ip: ip(type === 'laptop' ? '10.40' : type === 'vm' ? '10.60' : '10.90'),
    type, os: e.os || (type === 'laptop' ? pick(['macOS 15.0', 'macOS 14.6', 'Windows 11', 'Ubuntu 24.04']) : type === 'vm' ? 'Ubuntu 22.04' : 'iPadOS 18'),
    ephemeral: !!e.ephemeral, user: e.user || null, owner_kind: e.owner_kind || (e.user ? 'person' : 'service'),
    department: e.group ? G[e.group].name : (e.department || null), group_id: e.group || null,
    identity_source: e.identity_source !== undefined ? e.identity_source : (e.user ? (type === 'other' ? 'mdm' : 'idp') : null),
    sensor: 'pcap', agent_state: e.agent_state || 'enforcing', agent_version: e.noAgent ? null : '0.9.6',
    tools: e.tools || [], behind: false, behind_tool: null,
  };
  if (e.noAgent) o.agent_state = 'no_agent';
  endpoints.push(o);
  return o;
}
// named devices
for (const p of NAMED) {
  people.push({ id: 'usr_' + emailOf(p.name).split('@')[0].replace(/\./g, '_'), name: p.name, email: emailOf(p.name), group_id: p.group, title: p.title });
  for (const d of p.devices) addEndpoint({ ...d, user: p.name, group: p.group, tools: d.tools || (p.group ? G[p.group].tools.slice(0, 1) : ['claude-code']) });
}
for (const s of NAMED_SVC) addEndpoint({ host: s.host, type: 'vm', user: s.owner, owner_kind: 'service', group: s.group, identity_source: 'idp', tools: ['claude-code'] });
// fill each group to its member count
for (const g of GROUPS) {
  let lap = g.laptops - endpoints.filter(e => e.group_id === g.id && e.type === 'laptop').length;
  let vms = g.vms - endpoints.filter(e => e.group_id === g.id && e.type === 'vm').length;
  const vn = g.id === 'grp_contractors';
  while (lap-- > 0) { const n = newName(vn); people.push({ id: 'usr_' + emailOf(n).split('@')[0].replace(/\./g, '_'), name: n, email: emailOf(n), group_id: g.id, title: null }); addEndpoint({ host: newHost('laptop', vn ? 'LT-VN' : 'LT-SG'), type: 'laptop', user: n, group: g.id, tools: g.tools.slice(0, 1) }); }
  while (vms-- > 0) {
    if (g.id === 'grp_svc') { const h = newHost('vm', pick(['vm-ci-build', 'vm-etl-nightly', 'vm-recon-batch', 'vm-ci-runner'])); addEndpoint({ host: h, type: 'vm', user: 'svc-' + h.split('-')[1], owner_kind: 'service', group: g.id, identity_source: 'idp', tools: ['claude-code'] }); }
    else { const owner = newName(); people.push({ id: 'usr_' + emailOf(owner).split('@')[0].replace(/\./g, '_'), name: owner, email: emailOf(owner), group_id: g.id, title: null }); addEndpoint({ host: newHost('vm', 'vm-dev-' + owner.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')), type: 'vm', user: owner, group: g.id, tools: g.tools.slice(0, 1) }); }
  }
}
// ungrouped: 31 laptops (9 unmapped), 32 VMs (4 ephemeral no-agent build VMs, the rest analytics/infra), 16 MDM iPads
{
  const have = endpoints.filter(e => !e.group_id && e.type === 'laptop').length; // persona laptops (Wei Ling, Priscilla)
  for (let i = 0; i < 31 - have; i++) {
    if (i < 9) addEndpoint({ host: newHost('laptop'), type: 'laptop', user: null, owner_kind: 'person', identity_source: null, department: null, tools: [] });
    else { const n = newName(); people.push({ id: 'usr_' + emailOf(n).split('@')[0].replace(/\./g, '_'), name: n, email: emailOf(n), group_id: null, title: null }); addEndpoint({ host: newHost('laptop'), type: 'laptop', user: n, department: pick(['Finance', 'Legal & Compliance', 'Human Resources', 'Corporate Strategy', 'Technology Risk']), tools: [] }); }
  }
  addEndpoint({ host: 'vm-build-eph-9f2', type: 'vm', ephemeral: true, noAgent: true, identity_source: null });
  for (let i = 0; i < 3; i++) addEndpoint({ host: 'vm-build-eph-' + hex(3), type: 'vm', ephemeral: true, noAgent: true, identity_source: null });
  for (let i = 0; i < 28; i++) addEndpoint({ host: newHost('vm', pick(['vm-analytics', 'vm-jump', 'vm-report', 'vm-infra'])), type: 'vm', identity_source: null, tools: [] });
  addEndpoint({ host: 'MOB-IPAD-0931', type: 'other', user: newName(), noAgent: true, identity_source: 'mdm', department: 'Retail Banking Operations' });
  for (let i = 0; i < 15; i++) addEndpoint({ host: newHost('ipad'), type: 'other', user: newName(), noAgent: true, identity_source: 'mdm', department: 'Retail Banking Operations' });
}
// identities with claude-code for the baseline CUE count (231): ungrouped mapped laptops pick up claude-code
{
  const cc = () => endpoints.filter(e => e.agent_state !== 'no_agent' && e.tools.includes('claude-code')).length;
  // data group endpoints also run claude-code alongside gemini-cli
  endpoints.filter(e => e.group_id === 'grp_data').forEach(e => { if (!e.tools.includes('claude-code')) e.tools.push('claude-code'); });
  const pool = endpoints.filter(e => !e.group_id && e.type === 'laptop' && e.user && !e.tools.length);
  while (cc() < 231 && pool.length) pool.shift().tools.push('claude-code');
  // some VMs (analytics) run claude-code too if still short
  const vpool = endpoints.filter(e => !e.group_id && e.type === 'vm' && e.agent_state !== 'no_agent' && !e.tools.length);
  while (cc() < 231 && vpool.length) vpool.shift().tools.push('claude-code');
  if (cc() !== 231) throw new Error('baseline endpoint count ' + cc());
}
// agent states: offline 9, record_only 12, no_agent 20 (already set)
{
  const setState = (n, state, pred) => { const pool = endpoints.filter(e => e.agent_state === 'enforcing' && pred(e)); let have = endpoints.filter(e => e.agent_state === state).length; for (const e of pool) { if (have >= n) break; if (NAMED.some(p => p.devices.some(d => d.host === e.host))) continue; e.agent_state = state; have++; } };
  setState(9, 'offline', e => ['grp_retail_ops', 'grp_digital_eng', 'grp_treasury'].includes(e.group_id) || (!e.group_id && e.type === 'laptop'));
  setState(12, 'record_only', e => ['grp_retail_ops', 'grp_treasury'].includes(e.group_id) || (!e.group_id && e.type === 'vm'));
}
// CUE drift: Payments 6, Digital 9 (claude-code), Data 2 (gemini-cli); hero devices stay current
for (const g of GROUPS.filter(g => g.older)) {
  const tool = g.id === 'grp_data' ? 'gemini-cli' : 'claude-code';
  const pool = endpoints.filter(e => e.group_id === g.id && e.agent_state === 'enforcing' && e.tools.includes(tool) && !['LT-SG-2231', 'vm-dev-rahul-07', 'LT-SG-4402', 'LT-SG-1187', 'LT-SG-3310'].includes(e.host));
  pool.slice(0, g.older).forEach(e => { e.behind = true; e.behind_tool = tool; });
}
// sensors: 46 remote-staff laptops seen by SASE Zscaler, the rest by the Tampines DC span port
{
  const pool = endpoints.filter(e => e.type === 'laptop' && ['grp_retail_ops', 'grp_treasury', 'grp_digital_eng'].includes(e.group_id) && !['LT-SG-5133', 'LT-SG-5120'].includes(e.host));
  pool.slice(0, 46).forEach(e => { e.sensor = 'sase_zscaler'; });
}
if (endpoints.length !== 412) throw new Error('endpoints ' + endpoints.length);

// ---- services (27) -------------------------------------------------------------------------------
// [service_id, name, vendor, category, embedded_in, status, hits (7d), endpoints, first_seen_days_ago, reviewed_by, reviewed_days_ago, blurb, jurisdiction]
const SVC = [
  ['m365-copilot', 'Microsoft 365 Copilot', 'Microsoft', 'Assistant', 'Microsoft 365', 'approved', 24800, 298, 190, 'Tan Wei Ling', 180, 'Copilot inside the bank’s Microsoft 365 tenant.', 'SG'],
  ['github-copilot', 'GitHub Copilot', 'GitHub', 'Coding', 'GitHub Enterprise', 'approved', 17900, 171, 190, 'Tan Wei Ling', 180, 'Code completion in the sanctioned GitHub Enterprise tenant.', 'US'],
  ['claude-code', 'Claude Code', 'Anthropic', 'Coding agent', null, 'approved', 14650, 231, 160, 'Priscilla Goh', 150, 'Agentic coding CLI. Runs inside Aegis under a signed CUE.', 'US'],
  ['chatgpt-enterprise', 'ChatGPT Enterprise', 'OpenAI', 'Assistant', null, 'approved', 11300, 214, 170, 'Priscilla Goh', 160, 'Enterprise workspace with SSO and no training on bank data.', 'US'],
  ['anthropic-api', 'Anthropic Claude (API)', 'Anthropic', 'Model API', null, 'approved', 6200, 58, 160, 'Tan Wei Ling', 150, 'Direct model API used by internal tools.', 'US'],
  ['azure-openai', 'Azure OpenAI', 'Microsoft', 'Model API', null, 'approved', 5400, 44, 200, 'Tan Wei Ling', 195, 'Model API in the bank’s Azure Southeast Asia region.', 'SG'],
  ['gemini-workspace', 'Gemini (Workspace)', 'Google', 'Assistant', 'Google Workspace', 'approved', 4100, 96, 120, 'Priscilla Goh', 110, 'Gemini side panel for the Data & Analytics Workspace users.', 'US'],
  ['gemini-cli', 'Gemini CLI', 'Google', 'Coding agent', null, 'approved', 3050, 38, 90, 'Tan Wei Ling', 85, 'Agentic CLI used by Data & Analytics under a signed CUE.', 'US'],
  ['amazon-bedrock', 'Amazon Bedrock', 'AWS', 'Model API', null, 'approved', 2300, 17, 140, 'Tan Wei Ling', 130, 'Model API in the bank’s AWS Singapore account.', 'SG'],
  ['grammarly-business', 'Grammarly Business', 'Grammarly', 'Writing', null, 'approved', 1900, 122, 210, 'Arjun Menon', 205, 'Writing assistant browser extension (business plan).', 'US'],
  ['databricks-assistant', 'Databricks Assistant', 'Databricks', 'Data · embedded', 'Databricks', 'approved', 1640, 31, 100, 'Priscilla Goh', 95, 'Assistant inside the bank’s Databricks workspace.', 'SG'],
  ['zoom-ai', 'Zoom AI Companion', 'Zoom', 'Meetings · embedded', 'Zoom', 'approved', 1480, 188, 150, 'Arjun Menon', 140, 'Meeting summaries inside Zoom.', 'US'],
  ['cursor', 'Cursor', 'Anysphere', 'Coding', null, 'beta', 1420, 18, 45, 'Arjun Menon', 40, 'AI code editor. Beta for 18 Digital Banking engineers.', 'US'],
  ['notion-ai', 'Notion AI', 'Notion', 'Productivity · embedded', 'Notion', 'approved', 1150, 64, 130, 'Arjun Menon', 125, 'AI features inside the Notion workspace.', 'US'],
  ['salesforce-einstein', 'Salesforce Einstein', 'Salesforce', 'CRM · embedded', 'Salesforce', 'approved', 980, 42, 180, 'Tan Wei Ling', 175, 'AI features inside the sanctioned Salesforce org.', 'US'],
  ['chatgpt-personal', 'ChatGPT (personal)', 'OpenAI', 'Assistant', null, 'unapproved', 1210, 37, 170, 'Arjun Menon', 150, 'Personal ChatGPT accounts. Use ChatGPT Enterprise instead.', 'US'],
  ['claude-personal', 'Claude.ai (personal)', 'Anthropic', 'Assistant', null, 'unapproved', 640, 19, 150, 'Arjun Menon', 140, 'Personal Claude.ai accounts. Use Claude Code or the API instead.', 'US'],
  ['deepseek', 'DeepSeek', 'DeepSeek', 'Assistant', null, 'prohibited', 520, 6, 120, 'Priscilla Goh', 110, 'Prohibited: data residency outside approved jurisdictions.', 'CN'],
  ['glean', 'Glean', 'Glean', 'Enterprise search', null, 'under_review', 480, 11, 21, 'Arjun Menon', 14, 'Enterprise search pilot. Under review by Technology Risk.', 'US'],
  ['codex-cli', 'Codex CLI', 'OpenAI', 'Coding agent', null, 'unlabelled', 280, 7, 5, null, null, 'Agentic coding CLI. First seen on 7 contractor laptops.', 'US'],
  ['perplexity', 'Perplexity', 'Perplexity', 'Search', null, 'unlabelled', 240, 4, 0, null, null, 'AI answer engine. First seen today on 4 endpoints.', 'US'],
  ['otter', 'Otter.ai', 'Otter', 'Meeting transcription', null, 'under_review', 195, 6, 30, 'Arjun Menon', 20, 'Meeting bot with transcript storage. Under review.', 'US'],
  ['poe', 'Poe', 'Quora', 'Assistant aggregator', null, 'unapproved', 95, 4, 60, 'Arjun Menon', 55, 'Aggregates multiple model providers.', 'US'],
  ['kimi', 'Kimi', 'Moonshot AI', 'Assistant', null, 'prohibited', 60, 3, 50, 'Priscilla Goh', 45, 'Prohibited: data residency outside approved jurisdictions.', 'CN'],
  ['qwen-chat', 'Qwen Chat', 'Alibaba Cloud', 'Assistant', null, 'prohibited', 45, 2, 40, 'Priscilla Goh', 35, 'Prohibited: data residency outside approved jurisdictions.', 'CN'],
  ['le-chat', 'Le Chat', 'Mistral AI', 'Assistant', null, 'unlabelled', 40, 3, 12, null, null, 'Assistant. EU-hosted. Not yet reviewed.', 'FR'],
  ['hf-inference', 'Hugging Face Inference', 'Hugging Face', 'Model hosting', null, 'unlabelled', 35, 2, 9, null, null, 'Hosted inference API. Not yet reviewed.', 'US'],
];
const services = SVC.map(s => ({
  service_id: s[0], ai_service: s[1], vendor: s[2], category: s[3], embedded_in: s[4], status: s[5], hits: s[6], endpoints: s[7],
  first_seen: s[8] === 0 ? NOW - 2 * H - 41 * 60 : NOW - s[8] * DAY, last_seen: NOW - (s[0] === 'perplexity' ? 240 : 120 + (s[6] % 1700)),
  reviewed_by: s[9], reviewed_at: s[10] == null ? null : NOW - s[10] * DAY - 5 * H, description: s[11], jurisdiction: s[12],
  separability: s[4] ? 'embedded' : 'distinct', confidence: 'confirmed', users: Math.max(1, Math.round(s[7] * 0.95)),
  bytes: s[6] * 41230, risk_score: { approved: 22, beta: 38, under_review: 45, unapproved: 61, prohibited: 88, unlabelled: 55 }[s[5]],
  personal_account: /personal/.test(s[0]), is_new: s[8] <= 7,
})).sort((a, b) => b.hits - a.hits);
const TOTAL_HITS = services.reduce((a, s) => a + s.hits, 0);
if (TOTAL_HITS !== 102110) throw new Error('hits ' + TOTAL_HITS);

// distribute hits across endpoints (sum must equal TOTAL_HITS)
{
  const w = endpoints.map(e => (e.type === 'vm' ? 0.6 : e.type === 'other' ? 0.35 : 1) * (0.4 + R() * 1.6));
  const sw = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  endpoints.forEach((e, i) => { e.hits = Math.max(3, Math.floor(TOTAL_HITS * w[i] / sw)); acc += e.hits; });
  endpoints[endpoints.findIndex(e => e.host === 'LT-SG-2231')].hits += TOTAL_HITS - acc;
  endpoints.forEach(e => {
    e.services = e.type === 'other' ? 1 : 1 + Math.floor(R() * 5);
    e.bytes = e.hits * 38000 + Math.floor(R() * 90000);
    e.first_seen = NOW - Math.floor(30 + R() * 200) * DAY;
    e.last_seen = e.agent_state === 'offline' ? NOW - (2 * H + Math.floor(R() * 20 * H)) : e.sensor === 'sase_zscaler' ? NOW - (2 * H + 40 * 60) - Math.floor(R() * 3600) : NOW - Math.floor(R() * 1800);
    const agent = e.agent_state !== 'no_agent';
    e.allowed = agent ? Math.round(e.hits * (0.86 + R() * 0.1)) : 0;
    e.blocked = agent ? Math.round(e.hits * (0.005 + R() * 0.02)) : 0;
    e.recorded = agent ? Math.round(e.hits * (0.02 + R() * 0.05)) : 0;
    e.last_heartbeat = e.agent_state === 'offline' ? e.last_seen : agent ? NOW - Math.floor(R() * 540) : null;
  });
}

// ---- providers (Core expands providers into tools) -----------------------------------------------------
const byId = id => services.find(s => s.service_id === id);
const providers = [
  { id: 'p-anthropic', name: 'Anthropic', status_from: 'claude-code', tools: ['claude-code', 'anthropic-api', 'claude-personal'], surfaces: ['terminal · Aegis sandbox', 'API · internal tools', 'browser · personal account'] },
  { id: 'p-openai', name: 'OpenAI', status_from: 'chatgpt-enterprise', tools: ['chatgpt-enterprise', 'chatgpt-personal', 'codex-cli'], surfaces: ['browser · desktop app', 'browser · personal account', 'terminal'] },
  { id: 'p-google', name: 'Google', status_from: 'gemini-workspace', tools: ['gemini-workspace', 'gemini-cli'], surfaces: ['Workspace side panel', 'terminal · Aegis sandbox'] },
  { id: 'p-microsoft', name: 'Microsoft', status_from: 'm365-copilot', tools: ['m365-copilot', 'azure-openai'], surfaces: ['M365 apps', 'API · Azure SEA'] },
  { id: 'p-github', name: 'GitHub', status_from: 'github-copilot', tools: ['github-copilot'], surfaces: ['IDE extension'] },
].map(p => ({ ...p, endpoints: Math.max(...p.tools.map(t => byId(t).endpoints)), hits: p.tools.reduce((a, t) => a + byId(t).hits, 0) }));

// ---- sensors ----------------------------------------------------------------------------------------
const sensors = {
  endpoint: [
    { sensor: 'aegis-sandbox', source: 'sandbox', family: 'endpoint', events: 211840, blocks: 0, labels: 14, last_seen: NOW - 20 },
  ],
  discovery: [
    { sensor: 'Shield · pcap', family: 'discovery', rows: 0, services: 27, last_seen: NOW - 120, endpoints: endpoints.filter(e => e.sensor === 'pcap').length, hits: 0, health: 'ok', description: 'Packet capture on the Tampines DC core switch span port' },
    { sensor: 'Shield · sase_zscaler', family: 'discovery', rows: 0, services: 19, last_seen: NOW - (2 * H + 40 * 60), endpoints: endpoints.filter(e => e.sensor === 'sase_zscaler').length, hits: 0, health: 'silent', description: 'Zscaler web logs for remote staff via webhook · no data for 2 h 40 m' },
  ],
  directory: { connected: true, provider: 'Entra ID', mapped_endpoints: endpoints.filter(e => e.identity_source).length, total_endpoints: endpoints.length, last_sync: NOW - 20 * 60 },
};
for (const d of sensors.discovery) { const k = d.sensor.includes('pcap') ? 'pcap' : 'sase_zscaler'; d.hits = endpoints.filter(e => e.sensor === k).reduce((a, e) => a + e.hits, 0); d.rows = d.hits; }
if (sensors.directory.mapped_endpoints !== 371) throw new Error('directory mapped ' + sensors.directory.mapped_endpoints);

// ---- DLP rules ----------------------------------------------------------------------------------------
const dlp_rules = [
  { id: 'dlp-card-pan', label: 'Card number (PAN)', detail: 'Card primary account numbers, Luhn-checked, in prompts and tool output', mode: 'enforce', scope: 'Bank baseline · all Claude Code CUEs', state: 'live' },
  { id: 'dlp-nric', label: 'NRIC / FIN', detail: 'Singapore NRIC and FIN numbers, checksum-validated', mode: 'enforce', scope: 'Bank baseline · Data & Analytics', state: 'live' },
  { id: 'dlp-secrets', label: 'Secrets', detail: 'API keys, tokens, private keys and connection strings', mode: 'enforce', scope: 'Bank baseline · contractors', state: 'live' },
  { id: 'dlp-swift-mt', label: 'SWIFT MT103 / pacs.008', detail: 'Customer credit-transfer messages (MT103, ISO 20022 pacs.008)', mode: 'enforce', scope: 'Bank baseline', state: 'live' },
  { id: 'dlp-source-archive', label: 'Source archive', detail: 'Archives of internal source trees leaving the sandbox', mode: 'enforce', scope: 'Vendor Engineering (contractors)', state: 'live' },
  { id: 'dlp-mask-query-results', label: 'Mask query results', detail: 'Masks PAN and NRIC columns in MCP query results before they reach the model', mode: 'enforce', scope: 'Engineering — Payments (draft v4)', state: 'draft' },
];

// ---- CUEs ---------------------------------------------------------------------------------------------
const BASE_EGRESS = ['api.anthropic.com', 'registry.npmjs.org', 'pypi.org', 'github.' + DOMAIN];
const BASE_DLP = ['dlp-card-pan', 'dlp-nric', 'dlp-secrets', 'dlp-swift-mt'];
const cues = [
  { id: 'cue_bank_baseline', name: 'Claude Code — Bank baseline', tool: 'claude-code', scope: 'tool', scope_ref: 'claude-code', group_id: null, console_role: 'bank-baseline', base_cue_id: null, version: 5, state: 'published', updated_by: 'Tan Wei Ling', updated_at: NOW - 14 * DAY,
    egress_allow: BASE_EGRESS, mcp_servers: [], dlp_rules: BASE_DLP, internal_tools: [], endpoints_current: 231, endpoints_on_older: 0,
    versions: [[5, NOW - 14 * DAY, 'Tan Wei Ling', '+ DLP dlp-swift-mt'], [4, NOW - 40 * DAY, 'Tan Wei Ling', '+ egress github.' + DOMAIN], [3, NOW - 70 * DAY, 'Priscilla Goh', '+ DLP dlp-nric'], [2, NOW - 110 * DAY, 'Tan Wei Ling', '+ DLP dlp-card-pan, dlp-secrets'], [1, NOW - 160 * DAY, 'aegis', 'claude-code shipped default']] },
  { id: 'cue_payments_v3', name: 'Claude Code — Payments Engineering', tool: 'claude-code', scope: 'group', scope_ref: 'grp_payments_eng', group_id: 'grp_payments_eng', console_role: 'payments-eng', base_cue_id: 'cue_bank_baseline', version: 3, state: 'published', updated_by: 'Tan Wei Ling', updated_at: NOW - 9 * DAY,
    egress_allow: [...BASE_EGRESS, 'payments-replica.db.' + DOMAIN], own_egress: ['payments-replica.db.' + DOMAIN], mcp_servers: ['postgres-mcp', 'github-enterprise', 'jira'], dlp_rules: BASE_DLP, own_dlp: [], internal_tools: ['settlement-recon-helper'],
    versions: [[3, NOW - 9 * DAY, 'Tan Wei Ling', '+ MCP jira'], [2, NOW - 35 * DAY, 'Tan Wei Ling', '+ MCP postgres-mcp (read-only replica)'], [1, NOW - 80 * DAY, 'Tan Wei Ling', 'inherits Bank baseline · + MCP github-enterprise']],
    draft: { version: 4, by: 'Arjun Menon', at: NOW - H, add_dlp: ['dlp-mask-query-results'], note: 'Response to det_01JA4K9PAN1: mask PAN and NRIC columns in postgres-mcp results before they reach the model.' } },
  { id: 'cue_digital_v2', name: 'Claude Code — Digital Banking', tool: 'claude-code', scope: 'group', scope_ref: 'grp_digital_eng', group_id: 'grp_digital_eng', console_role: 'digital-eng', base_cue_id: 'cue_bank_baseline', version: 2, state: 'published', updated_by: 'Tan Wei Ling', updated_at: NOW - 12 * DAY,
    egress_allow: [...BASE_EGRESS, 'api.mobile-sandbox.' + DOMAIN], own_egress: ['api.mobile-sandbox.' + DOMAIN], mcp_servers: ['github-enterprise', 'jira'], dlp_rules: BASE_DLP, own_dlp: [], internal_tools: [],
    versions: [[2, NOW - 12 * DAY, 'Tan Wei Ling', '+ MCP jira'], [1, NOW - 75 * DAY, 'Tan Wei Ling', 'inherits Bank baseline · + MCP github-enterprise']] },
  { id: 'cue_data_v2', name: 'Gemini CLI — Data & Analytics', tool: 'gemini-cli', scope: 'group', scope_ref: 'grp_data', group_id: 'grp_data', console_role: 'data', base_cue_id: null, version: 2, state: 'published', updated_by: 'Priscilla Goh', updated_at: NOW - 16 * DAY,
    egress_allow: ['generativelanguage.googleapis.com', 'oauth2.googleapis.com', 'pypi.org'], own_egress: ['generativelanguage.googleapis.com', 'oauth2.googleapis.com', 'pypi.org'], mcp_servers: ['warehouse-mcp', 'jira'], dlp_rules: ['dlp-nric', 'dlp-card-pan', 'dlp-secrets'], own_dlp: ['dlp-nric', 'dlp-card-pan', 'dlp-secrets'], internal_tools: [],
    versions: [[2, NOW - 16 * DAY, 'Priscilla Goh', '+ MCP warehouse-mcp (only with dlp-nric Enforce)'], [1, NOW - 90 * DAY, 'Tan Wei Ling', 'gemini-cli shipped default + DLP']] },
  { id: 'cue_soc_v1', name: 'Claude Code — Cyber Defence', tool: 'claude-code', scope: 'group', scope_ref: 'grp_soc', group_id: 'grp_soc', console_role: 'soc', base_cue_id: 'cue_bank_baseline', version: 1, state: 'published', updated_by: 'Arjun Menon', updated_at: NOW - 30 * DAY,
    egress_allow: [...BASE_EGRESS], own_egress: [], mcp_servers: ['jira'], dlp_rules: BASE_DLP, own_dlp: [], internal_tools: [],
    versions: [[1, NOW - 30 * DAY, 'Tan Wei Ling', 'inherits Bank baseline · + MCP jira']] },
  { id: 'cue_contractors_v1', name: 'Codex CLI — Vendor contractors', tool: 'codex-cli', scope: 'group', scope_ref: 'grp_contractors', group_id: 'grp_contractors', console_role: 'contractors', base_cue_id: null, version: 1, state: 'published', updated_by: 'Tan Wei Ling', updated_at: NOW - 20 * DAY,
    egress_allow: ['api.openai.com', 'github.' + DOMAIN], own_egress: ['api.openai.com', 'github.' + DOMAIN], mcp_servers: ['github-enterprise'], dlp_rules: ['dlp-secrets', 'dlp-source-archive', 'dlp-card-pan'], own_dlp: ['dlp-secrets', 'dlp-source-archive', 'dlp-card-pan'], internal_tools: [],
    versions: [[1, NOW - 20 * DAY, 'Tan Wei Ling', 'codex-cli shipped default + DLP']] },
];
for (const c of cues.filter(c => c.group_id)) {
  const tool = c.tool;
  const eps = endpoints.filter(e => e.group_id === c.group_id && e.agent_state !== 'no_agent' && e.tools.includes(tool));
  c.endpoints_on_older = eps.filter(e => e.behind && e.behind_tool === tool).length;
  c.endpoints_current = eps.length - c.endpoints_on_older;
}
for (const g of GROUPS) { g.assigned_cue_id = g.cue; g.assigned_cue_name = g.cue ? cues.find(c => c.id === g.cue).name + ' v' + cues.find(c => c.id === g.cue).version : null; }

// ---- MCP Bridge catalog ---------------------------------------------------------------------------
const bridge = [
  { id: 'mcp_postgres', name: 'postgres-mcp', source: 'npm · @modelcontextprotocol/server-postgres', kind: 'local', status: 'approved', risk_score: 58, risk_tier: 'medium', capabilities: { tools: ['query', 'list_tables', 'describe_table'], writes: false, target: 'payments-replica (Postgres, read-only)' }, findings: { high: 0, medium: 1, low: 2, summary: 'Read-only replica role; query results can carry PAN and NRIC columns' }, approved_by: 'Priscilla Goh', approved_reason: 'Read-only replica for settlement debugging; Payments Engineering only', created_at: NOW - 40 * DAY },
  { id: 'mcp_github_enterprise', name: 'github-enterprise', source: 'github.' + DOMAIN + '/platform/github-mcp', kind: 'remote', status: 'approved', risk_score: 44, risk_tier: 'medium', capabilities: { tools: ['search_code', 'get_file', 'create_pull_request'], disabled_tools: ['push_files'], writes: true }, findings: { high: 0, medium: 1, low: 1, summary: 'push_files disabled at the Bridge' }, approved_by: 'Tan Wei Ling', approved_reason: 'Source hosting; push only through pull requests', created_at: NOW - 80 * DAY },
  { id: 'mcp_jira', name: 'jira', source: 'jira.' + DOMAIN + '/mcp', kind: 'remote', status: 'approved', risk_score: 18, risk_tier: 'low', capabilities: { tools: ['search_issues', 'get_issue', 'add_comment'], writes: true }, findings: { high: 0, medium: 0, low: 1, summary: 'Comment-only writes' }, approved_by: 'Tan Wei Ling', approved_reason: 'Ticket context for engineering and SOC', created_at: NOW - 60 * DAY },
  { id: 'mcp_warehouse', name: 'warehouse-mcp', source: 'internal · data-platform/warehouse-mcp', kind: 'remote', status: 'approved', risk_score: 71, risk_tier: 'high', capabilities: { tools: ['run_query', 'list_datasets'], writes: false, target: 'customer_360 warehouse' }, findings: { high: 1, medium: 1, low: 0, summary: 'Reaches customer_360 PII; allowed only with dlp-nric in Enforce' }, approved_by: 'Priscilla Goh', approved_reason: 'Data & Analytics only, with dlp-nric Enforce', created_at: NOW - 16 * DAY },
  { id: 'mcp_confluence', name: 'confluence', source: 'confluence.' + DOMAIN + '/mcp', kind: 'remote', status: 'scanning', risk_score: 24, risk_tier: 'low', capabilities: { tools: ['search', 'get_page'], writes: false }, findings: { high: 0, medium: 0, low: 1, summary: 'Scan complete · read-only · awaiting an Admin or CISO decision', scan_complete: true }, approved_by: null, approved_reason: null, created_at: NOW - 3 * H, requested_by: 'Rahul Iyer', request_reason: 'Read runbooks while debugging settlement jobs' },
  { id: 'mcp_filesystem', name: 'filesystem', source: 'npm · @modelcontextprotocol/server-filesystem', kind: 'local', status: 'blocked', risk_score: 82, risk_tier: 'high', capabilities: { tools: ['read_file', 'list_directory', 'write_file'], writes: true }, findings: { high: 1, medium: 0, low: 0, summary: 'Writes outside the workspace' }, approved_by: 'Tan Wei Ling', approved_reason: 'Blocked: writes outside workspace', created_at: NOW - 50 * DAY },
  { id: 'mcp_slack', name: 'slack', source: 'npm · @modelcontextprotocol/server-slack', kind: 'remote', status: 'blocked', risk_score: 77, risk_tier: 'high', capabilities: { tools: ['read_channel', 'post_message'], writes: true }, findings: { high: 1, medium: 1, low: 0, summary: 'Customer data in channels' }, approved_by: 'Priscilla Goh', approved_reason: 'Blocked: customer data in channels', created_at: NOW - 45 * DAY },
];
const mcpIdByName = Object.fromEntries(bridge.map(b => [b.name, b.id]));

// ---- MCP & skills observed on endpoints (Core) -------------------------------------------------------
const hostOf = h => endpoints.find(e => e.host === h);
const mcp_discovered = [];
const addDisc = (name, host, tool, extra = {}) => {
  const b = bridge.find(x => x.name === name);
  mcp_discovered.push({ mcp_id: b ? b.id : 'mcp_' + name.replace(/[^a-z0-9]/g, '_'), name, kind: b ? b.kind : (extra.kind || 'local'), endpoint_id: 'ep_' + host, host, tool,
    bridge_state: b ? (b.status === 'approved' ? 'onboarded' : b.status === 'blocked' ? 'blocked' : 'unonboarded') : 'unonboarded',
    risk_tier: extra.risk_tier !== undefined ? extra.risk_tier : b ? b.risk_tier : null, flags: extra.flags || [], first_seen: NOW - (extra.age || 20) * DAY, last_seen: NOW - Math.floor(R() * 3000) });
};
const epsOf = (g, n, tool) => endpoints.filter(e => e.group_id === g && e.agent_state !== 'no_agent' && e.tools.includes(tool)).slice(0, n).map(e => e.host);
['LT-SG-2231', ...epsOf('grp_payments_eng', 30, 'claude-code').filter(h => h !== 'LT-SG-2231').slice(0, 29)].forEach(h => addDisc('postgres-mcp', h, 'claude-code'));
[...epsOf('grp_payments_eng', 20, 'claude-code'), ...epsOf('grp_digital_eng', 50, 'claude-code'), ...epsOf('grp_contractors', 18, 'codex-cli')].forEach(h => addDisc('github-enterprise', h, hostOf(h).tools[0]));
[...epsOf('grp_payments_eng', 12, 'claude-code'), ...epsOf('grp_digital_eng', 30, 'claude-code'), ...epsOf('grp_soc', 10, 'claude-code')].forEach(h => addDisc('jira', h, 'claude-code'));
['LT-SG-4402', ...epsOf('grp_data', 22, 'gemini-cli').filter(h => h !== 'LT-SG-4402').slice(0, 21)].forEach(h => addDisc('warehouse-mcp', h, 'gemini-cli'));
addDisc('gmail-mcp', 'LT-SG-5120', 'claude-desktop', { risk_tier: 'high', flags: ['unapproved', 'unonboarded', 'reaches-customer-email'], age: 2, kind: 'remote' });
addDisc('puppeteer', 'LT-VN-0419', 'codex-cli', { risk_tier: 'medium', flags: ['unapproved', 'unonboarded'], age: 4 });
addDisc('filesystem', 'LT-SG-3391', 'claude-code', { flags: ['blocked-at-bridge', 'still-configured'], age: 30 });
const skills = [];
const addSkill = (name, host, tool, source, flags = []) => skills.push({ skill_id: 'skl_' + name.replace(/-/g, '_') + '_' + host.toLowerCase().replace(/-/g, ''), name, endpoint_id: 'ep_' + host, tool, source, flags, last_seen: NOW - Math.floor(R() * 7200) });
['LT-SG-2231', ...epsOf('grp_payments_eng', 12, 'claude-code').filter(h => h !== 'LT-SG-2231').slice(0, 11)].forEach(h => addSkill('settlement-recon-helper', h, 'claude-code', 'user'));
['LT-VN-0412', 'LT-VN-0419', epsOf('grp_contractors', 3, 'codex-cli').find(h => !['LT-VN-0412', 'LT-VN-0419'].includes(h))].forEach(h => addSkill('web-scraper', h, 'codex-cli', 'user', ['network-egress']));
[...epsOf('grp_digital_eng', 40, 'claude-code'), ...epsOf('grp_data', 24, 'claude-code')].forEach(h => addSkill('xlsx', h, 'claude-code', 'builtin'));

// ---- detections (58) ---------------------------------------------------------------------------------
const FAMILIES = [
  { rule_id: 'CARD-PAN', label: 'Card number (PAN) in agent context', description: 'A card primary account number reached an agent prompt or tool result. DLP inspects the turn before it leaves the sandbox.', severity: 'critical', owasp: null, signal: 'guest', dlp: 'dlp-card-pan', split: [5, 0, 1] },
  { rule_id: 'PII-NRIC', label: 'NRIC / FIN in agent context', description: 'A Singapore NRIC or FIN number reached an agent prompt or tool result.', severity: 'critical', owasp: null, signal: 'guest', dlp: 'dlp-nric', split: [8, 0, 1] },
  { rule_id: 'EXFIL', label: 'Data exfiltration', description: 'A transfer of sensitive data toward a destination outside the CUE egress allow-list.', severity: 'critical', owasp: 'ASI05', signal: 'guest', dlp: 'dlp-source-archive', split: [1, 0, 1] },
  { rule_id: 'SWIFT-MSG', label: 'SWIFT payment message in agent context', description: 'An MT103 or pacs.008 customer credit transfer reached an agent prompt.', severity: 'high', owasp: null, signal: 'guest', dlp: 'dlp-swift-mt', split: [3, 0, 0] },
  { rule_id: 'SECRET-IN-PROMPT', label: 'Secret in prompt', description: 'An API key, token, private key or connection string in a prompt or file sent to the model.', severity: 'high', owasp: null, signal: 'guest', dlp: 'dlp-secrets', split: [7, 1, 0] },
  { rule_id: 'PROHIBITED-SERVICE', label: 'Prohibited AI service', description: 'Traffic to a service labelled Prohibited in Discover (data residency).', severity: 'high', owasp: null, signal: 'wire', dlp: null, split: [11, 0, 0] },
  { rule_id: 'SENSITIVE-ACCESS', label: 'Sensitive file access', description: 'Access to a secret, judged by file content rather than filename or path.', severity: 'medium', owasp: 'ASI04', signal: 'guest', dlp: null, split: [12, 2, 0] },
  { rule_id: 'UNDISCLOSED-ACTION', label: 'Undisclosed action', description: 'The agent did more than it declared; the engine cross-checks the declared manifest against what it observed.', severity: 'medium', owasp: null, signal: 'guest', dlp: null, split: [0, 5, 0] },
];
const cueForEp = e => { const g = e.group_id && G[e.group_id]; const c = g && g.cue && cues.find(x => x.id === g.cue); if (c) return c; return e.tools.includes('claude-code') ? cues[0] : null; };
const PAN = '4539 •••• •••• 1187', NRIC = 'S•••••••D';
const detections = [];
const sessionsById = {};
const mkSid = () => 'sbx_' + hex(12);
function det(o) {
  const e = hostOf(o.host); const f = FAMILIES.find(x => x.rule_id === o.rule);
  const row = { detection_id: o.id || 'det_01JA' + ulid(7), ts: o.ts, rule_id: f.rule_id, rule_label: f.label, severity: f.severity, disposition: o.disp,
    device_id: e.device_id, endpoint_id: e.endpoint_id, host: e.host, owner: e.user, owner_kind: e.owner_kind, department: e.department, group_id: e.group_id,
    session_id: o.sid || mkSid(), teaser: o.teaser, target_type: o.target_type, evidence: o.evidence, chain_extra: o.chain || [], fix_hint: o.fix_hint || null, tool: o.tool || (e.tools[0] || null), blast_execution_id: o.exec || null };
  detections.push(row); return row;
}
const ev = (type, body) => ({ type, decoded_command: null, sensitive_content: null, exfil: null, egress_spike: null, persistence: null, undisclosed_action: null, [type]: body });
// named detections
const HERO_SID = 'sbx_7c21e9a04b3f';
det({ id: 'det_01JA4K9PAN1', rule: 'CARD-PAN', disp: 'escalated', host: 'LT-SG-2231', ts: NOW - 2 * H, sid: HERO_SID, exec: 'exec_01JA4K9PAN1', target_type: 'MCP tool result → model prompt',
  teaser: 'cards.txn_ledger · 1,240 rows with PAN + NRIC columns → api.anthropic.com (blocked before transmission)',
  evidence: ev('sensitive_content', { path: 'postgres-mcp · query result (cards.txn_ledger)', basis: '1,240 rows with card PAN and NRIC columns in the tool result headed to api.anthropic.com', pattern: 'Luhn-valid 16-digit PAN · NRIC checksum', snippet_redacted: `txn_id=TX-88210, pan=${PAN}, nric=${NRIC}, amount=SGD 1,240.00` }),
  fix_hint: 'Your query returned raw card numbers and NRICs, so DLP stopped the prompt before it left your laptop. Query aggregated columns only (SUM/COUNT by settlement batch), or wait for Payments CUE v4, which masks these columns automatically.',
  chain: [{ label: 'postgres-mcp.query via Aegis Bridge · .env credentials', dt: -40 }, { label: 'egress pastebin.com blocked by CUE (not in allow-list)', dt: 25, blocked: true }] });
det({ rule: 'PII-NRIC', disp: 'escalated', host: 'LT-SG-4402', ts: NOW - 5 * H - 12 * 60, exec: 'exec_01JA4F2NRIC7', target_type: 'MCP tool result → model prompt', teaser: 'customer_360.party · 612 rows with NRIC column via warehouse-mcp (blocked)',
  evidence: ev('sensitive_content', { path: 'warehouse-mcp · run_query (customer_360.party)', basis: '612 NRIC values in the tool result', pattern: 'NRIC checksum', snippet_redacted: `party_id=P-20931, nric=${NRIC}, segment=MASS` }) });
det({ rule: 'PII-NRIC', disp: 'blocked', host: 'LT-SG-2231', ts: NOW - 26 * H, exec: 'exec_01JA3Q8FIXT', target_type: 'file → model prompt', teaser: 'tests/fixtures/customers.json · 14 NRIC values in a test fixture (blocked)',
  evidence: ev('sensitive_content', { path: 'tests/fixtures/customers.json', basis: '14 NRIC values in a test fixture sent as context', pattern: 'NRIC checksum', snippet_redacted: `{"name":"C. T.","nric":"${NRIC}"}` }),
  fix_hint: 'A test fixture contained real-format NRICs. Replace them with the synthetic generator (make fixtures-synthetic) and re-run.' });
det({ rule: 'EXFIL', disp: 'escalated', host: 'LT-VN-0412', ts: NOW - 9 * H, exec: 'exec_01JA3ZPASTE', target_type: 'archive → external host', teaser: 'mobile-app-src.tar.gz · 18.4 MB → paste.ee (blocked by CUE egress)',
  evidence: ev('exfil', { destination: 'paste.ee', bytes: 19293798, classification: 'internal source archive' }) });
det({ rule: 'EXFIL', disp: 'blocked', host: 'LT-VN-0419', ts: NOW - 3 * DAY - 4 * H, target_type: 'archive → external host', teaser: 'app-config.zip · 2.1 MB → transfer.sh (blocked)',
  evidence: ev('exfil', { destination: 'transfer.sh', bytes: 2202009, classification: 'internal source archive' }) });
det({ rule: 'SWIFT-MSG', disp: 'blocked', host: 'LT-SG-5120', ts: NOW - 7 * H, exec: 'exec_01JA3ZMT103', target_type: 'pasted text → model prompt', teaser: 'MT103 customer credit transfer pasted into a prompt (blocked)',
  evidence: ev('sensitive_content', { path: 'prompt text', basis: 'SWIFT MT103 block 4 with ordering customer and beneficiary account', pattern: ':20:, :32A:, :50K:, :59: tags', snippet_redacted: ':32A:260927SGD•••••,00 :50K:/•••••••• :59:/••••••••' }) });
det({ rule: 'SECRET-IN-PROMPT', disp: 'blocked', host: 'vm-ci-build-214', ts: NOW - 11 * H, exec: 'exec_01JA3VDEPLOY', target_type: 'file → model prompt', teaser: 'deploy/keys/prod-deploy.pem · private key in file content (blocked)',
  evidence: ev('sensitive_content', { path: 'deploy/keys/prod-deploy.pem', basis: 'PEM private key', pattern: 'PEM private-key header', snippet_redacted: '-----BEGIN OPENSSH PRIVATE KEY----- ••••••••' }) });
det({ rule: 'SECRET-IN-PROMPT', disp: 'blocked', host: 'vm-dev-rahul-07', ts: NOW - 30 * H, exec: 'exec_01JA3NCREDF', target_type: 'file → model prompt', teaser: '~/.config/settlement/credentials · connection string with password (blocked)',
  evidence: ev('sensitive_content', { path: '~/.config/settlement/credentials', basis: 'Postgres connection URI with inline password', pattern: 'postgres://user:pass@host/db', snippet_redacted: 'DATABASE_URL=postgres://svc_recon:••••••@payments-replica.db.' + DOMAIN + ':5432/cards' }),
  fix_hint: 'Credentials in a file were sent as context. Use the Aegis Bridge vault connection for postgres-mcp instead of local credential files.' });
// generated remainder to hit each family's exact split
const pools = {
  'CARD-PAN': () => pick(endpoints.filter(e => e.group_id === 'grp_payments_eng' && e.agent_state !== 'no_agent' && e.host !== 'LT-SG-2231')),
  'PII-NRIC': () => pick(endpoints.filter(e => ['grp_data', 'grp_digital_eng'].includes(e.group_id) && e.agent_state !== 'no_agent')),
  'SWIFT-MSG': () => pick(endpoints.filter(e => e.group_id === 'grp_payments_eng' && e.agent_state !== 'no_agent')),
  'SECRET-IN-PROMPT': () => pick(endpoints.filter(e => ['grp_digital_eng', 'grp_svc', 'grp_contractors'].includes(e.group_id) && e.agent_state !== 'no_agent')),
  'PROHIBITED-SERVICE': null,
  'SENSITIVE-ACCESS': () => pick(endpoints.filter(e => ['grp_digital_eng', 'grp_payments_eng', 'grp_data'].includes(e.group_id) && e.agent_state !== 'no_agent')),
  'UNDISCLOSED-ACTION': () => pick(endpoints.filter(e => ['grp_digital_eng', 'grp_soc'].includes(e.group_id) && e.agent_state !== 'no_agent')),
};
const GEN_EVID = {
  'CARD-PAN': () => ({ t: 'MCP tool result → model prompt', teaser: 'card PAN in query result (blocked)', e: ev('sensitive_content', { path: 'postgres-mcp · query result', basis: 'card PAN in tool result', pattern: 'Luhn-valid 16-digit PAN', snippet_redacted: `pan=${PAN}` }) }),
  'PII-NRIC': () => ({ t: 'tool result → model prompt', teaser: 'NRIC values in tool result (blocked)', e: ev('sensitive_content', { path: 'tool result', basis: 'NRIC values', pattern: 'NRIC checksum', snippet_redacted: `nric=${NRIC}` }) }),
  'SWIFT-MSG': () => ({ t: 'file → model prompt', teaser: 'pacs.008 message in a test file (blocked)', e: ev('sensitive_content', { path: 'samples/pacs008.xml', basis: 'ISO 20022 pacs.008 credit transfer', pattern: '<FIToFICstmrCdtTrf>', snippet_redacted: '<DbtrAcct><Id>••••••••</Id></DbtrAcct>' }) }),
  'SECRET-IN-PROMPT': () => ({ t: 'file → model prompt', teaser: pick(['.env · API token (blocked)', 'config.yaml · access key (blocked)', 'notes.md · bearer token (blocked)']), e: ev('sensitive_content', { path: pick(['.env', 'config.yaml', 'notes.md']), basis: 'API token', pattern: 'high-entropy token', snippet_redacted: 'TOKEN=••••••••' }) }),
  'SENSITIVE-ACCESS': () => ({ t: 'file read', teaser: pick(['~/.aws/credentials read', 'id_ed25519 read', 'prod.env~ read']), e: ev('sensitive_content', { path: pick(['~/.aws/credentials', '~/.ssh/id_ed25519', 'prod.env~']), basis: 'credential material by content', pattern: 'credential file content', snippet_redacted: '•••••••• (redacted at source)' }) }),
  'UNDISCLOSED-ACTION': () => { const d = 3 + Math.floor(R() * 3), o = d + 1 + Math.floor(R() * 2); return { t: 'agent actions', teaser: `declared ${d} · observed ${o}`, e: ev('undisclosed_action', { declared: d, observed: o, undeclared: o - d, declared_list: ['Read files under ./src', 'Ran the test suite', 'Formatted changed files'].slice(0, Math.min(3, d)), observed_extra: ['Egress to an unlisted host', 'Read ~/.aws/credentials'].slice(0, o - d) }) }; },
};
for (const f of FAMILIES) {
  const [b, r, e] = f.split; const want = [...Array(b).fill('blocked'), ...Array(r).fill('recorded'), ...Array(e).fill('escalated')];
  const have = detections.filter(d => d.rule_id === f.rule_id).map(d => d.disposition);
  for (const h of have) { const i = want.indexOf(h); if (i < 0) throw new Error('split mismatch ' + f.rule_id); want.splice(i, 1); }
  if (f.rule_id === 'PROHIBITED-SERVICE') {
    const treasury = endpoints.filter(x => x.group_id === 'grp_treasury' && x.agent_state === 'enforcing');
    const deep = [hostOf('LT-SG-5133'), ...treasury.filter(x => x.host !== 'LT-SG-5133' && x.host !== 'LT-SG-5120').slice(0, 5)];
    const dest = [...deep.map(x => [x, 'api.deepseek.com', 'DeepSeek']), ...treasury.slice(7, 10).map(x => [x, 'kimi.moonshot.cn', 'Kimi']), ...treasury.slice(10, 12).map(x => [x, 'chat.qwen.ai', 'Qwen Chat'])];
    dest.forEach(([x, d, svc], i) => det({ rule: f.rule_id, disp: 'blocked', host: x.host, ts: NOW - Math.floor((0.3 + i * 0.55) * DAY), tool: null, target_type: 'network request', teaser: `${d} · ${svc} is labelled Prohibited (blocked)`, evidence: ev('exfil', { destination: d, bytes: 4000 + Math.floor(R() * 90000), classification: 'prohibited AI service (data residency)' }) }));
    continue;
  }
  for (const disp of want) { const x = pools[f.rule_id](); const g = GEN_EVID[f.rule_id](); det({ rule: f.rule_id, disp, host: x.host, ts: NOW - Math.floor(R() * 6.8 * DAY) - 600, target_type: g.t, teaser: g.teaser, evidence: g.e }); }
}
if (detections.length !== 58) throw new Error('detections ' + detections.length);
// 58 detections over 51 sessions: 7 generated guest detections share a session (same host) with another one
{
  const cands = detections.filter(d => !d.blast_execution_id && d.detection_id !== 'det_01JA4K9PAN1' && d.rule_id !== 'PROHIBITED-SERVICE');
  for (let i = 0; i < 7; i++) {
    const a = cands[2 * i], b = cands[2 * i + 1], e = hostOf(a.host);
    Object.assign(b, { host: e.host, device_id: e.device_id, endpoint_id: e.endpoint_id, owner: e.user, owner_kind: e.owner_kind, department: e.department, group_id: e.group_id, tool: a.tool, session_id: a.session_id, ts: a.ts + 90 + i * 7 });
  }
}
const detSessions = [...new Set(detections.map(d => d.session_id))];
if (detSessions.length !== 51) throw new Error('detected sessions ' + detSessions.length);
detections.sort((a, b) => b.ts - a.ts);

// ---- runtime blast radius (7 DLP-blocked executions) ---------------------------------------------------
const blastDefs = [
  { exec: 'exec_01JA4K9PAN1', host: 'LT-SG-2231', mcp: 'postgres-mcp', sbx: 'sbx-pg-7c21', cred: '.env credentials', credLong: 'Read DATABASE_URL from .env in ~/src/settlement-recon', action: "SELECT * FROM cards.txn_ledger WHERE settle_date = current_date - 1", data: 'cards.txn_ledger — 1,240 rows', dlp: 'Card PAN + NRIC', outcome: 'Blocked before prompt left the sandbox', dlpLong: `Flagged 1,240 card PANs (e.g. ${PAN}) and NRICs (e.g. ${NRIC}) in the tool result headed to api.anthropic.com. Blocked before it left the sandbox; follow-up egress to pastebin.com blocked by the CUE.`, verdict: 'block' },
  { exec: 'exec_01JA3Q8FIXT', host: 'LT-SG-2231', mcp: 'github-enterprise', sbx: 'sbx-gh-2231', cred: 'Bridge vault token', credLong: 'GitHub token held by the Aegis Bridge', action: 'get_file tests/fixtures/customers.json', data: 'settlement-recon · customers.json fixture', dlp: 'NRIC in test fixture', outcome: 'Blocked before prompt left the sandbox', dlpLong: `Flagged 14 NRICs (e.g. ${NRIC}) in a test fixture sent as context. Blocked.`, verdict: 'block' },
  { exec: 'exec_01JA3NCREDF', host: 'vm-dev-rahul-07', mcp: 'postgres-mcp', sbx: 'sbx-pg-r07a', cred: 'credential file', credLong: 'Read ~/.config/settlement/credentials', action: 'read ~/.config/settlement/credentials', data: 'credentials file · 1 connection string', dlp: 'Secret in prompt', outcome: 'Blocked before prompt left the sandbox', dlpLong: 'Flagged a connection string with an inline password in file content sent to the model. Blocked.', verdict: 'block' },
  { exec: 'exec_01JA4F2NRIC7', host: 'LT-SG-4402', mcp: 'warehouse-mcp', sbx: 'sbx-wh-4402', cred: 'Bridge vault token', credLong: 'Warehouse service token held by the Aegis Bridge', action: 'SELECT party_id, nric, segment FROM customer_360.party LIMIT 1000', data: 'customer_360.party — 612 rows', dlp: 'NRIC', outcome: 'Blocked before prompt left the sandbox', dlpLong: `Flagged 612 NRICs (e.g. ${NRIC}) in the tool result headed to generativelanguage.googleapis.com. Blocked.`, verdict: 'block' },
  { exec: 'exec_01JA3ZPASTE', host: 'LT-VN-0412', mcp: 'github-enterprise', sbx: 'sbx-gh-vn12', cred: 'personal access token', credLong: 'Personal access token from ~/.config/gh', action: 'tar czf mobile-app-src.tar.gz ./ && POST paste.ee', data: 'mobile-app-src.tar.gz — 18.4 MB', dlp: 'Source archive', outcome: 'Egress blocked · escalated', dlpLong: 'Flagged an archive of the internal source tree headed to paste.ee (not in the CUE allow-list). Blocked and escalated to the SOC.', verdict: 'block' },
  { exec: 'exec_01JA3ZMT103', host: 'LT-SG-5120', mcp: 'gmail-mcp (not onboarded)', sbx: 'host · no sandbox', cred: 'Gmail OAuth token', credLong: 'OAuth token for a Gmail account configured in Claude Desktop', action: 'draft email with pasted MT103', data: 'MT103 · 1 customer credit transfer', dlp: 'SWIFT MT103', outcome: 'Blocked before prompt left the endpoint', dlpLong: 'Flagged an MT103 customer credit transfer in a prompt. Blocked; gmail-mcp is not onboarded in the MCP Bridge.', verdict: 'block' },
  { exec: 'exec_01JA3VDEPLOY', host: 'vm-ci-build-214', mcp: 'github-enterprise', sbx: 'sbx-gh-ci214', cred: 'runner environment', credLong: 'GITHUB_TOKEN from the CI runner environment', action: 'get_file deploy/keys/prod-deploy.pem', data: 'payments-api · prod-deploy.pem', dlp: 'Deploy key', outcome: 'Blocked before prompt left the sandbox', dlpLong: 'Flagged a PEM deploy key in file content sent to the model. Blocked.', verdict: 'block' },
];
const blast = blastDefs.map(b => {
  const d = detections.find(x => x.blast_execution_id === b.exec); const e = hostOf(b.host); const c = cueForEp(e);
  const cueName = c ? c.name + ' v' + c.version : 'No CUE (host)';
  const nodes = [
    { id: 'n1', kind: 'endpoint', label: `${e.host} · ${e.user}`, detail: e.department, verdict: null },
    { id: 'n2', kind: 'cue', label: c ? c.name.split(' — ')[1] + ' v' + c.version : 'no CUE', detail: c ? c.name : null, verdict: 'allow' },
    { id: 'n3', kind: 'mcp_sandbox', label: b.mcp + (b.sbx.startsWith('sbx') ? ' (Aegis Bridge)' : ''), detail: b.sbx, verdict: 'allow' },
    { id: 'n4', kind: 'credential', label: b.cred, detail: b.credLong, verdict: 'allow' },
    { id: 'n5', kind: 'data', label: b.data, detail: b.action, verdict: 'flag' },
    { id: 'n6', kind: 'dlp_outcome', label: b.outcome, detail: b.dlpLong, verdict: 'block' },
  ];
  return { execution_id: b.exec, detection_id: d.detection_id, session_id: d.session_id, ts: d.ts, owner: e.user, host: e.host, cue_id: c ? c.id : null, cue_name: cueName, tool: d.tool || (e.tools[0] || null),
    worst_outcome: 'blocked', dlp_label: b.dlp, node_count: nodes.length, mcp: b.mcp, sandbox: b.sbx, credential: b.cred, credential_detail: b.credLong, action: b.action, data: b.data, dlp_long: b.dlpLong,
    graph: { execution_id: b.exec, nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })) } };
});

// ---- sessions (1,934: 1,861 clean · 51 detected · 22 stopped) ------------------------------------------
// usage per group (7d, USD) and identities
const USAGE_GROUPS = [
  { group_id: 'grp_digital_eng', cost: 2610.44, users: 88, sessions: 781, stops: 9, models: { 'claude-sonnet-5': 2410.44, 'gemini-2.5-pro': 200.00 }, cap_usd: 40, mode: 'hard_stop' },
  { group_id: 'grp_payments_eng', cost: 1740.12, users: 46, sessions: 402, stops: 6, models: { 'claude-sonnet-5': 1429.05, 'gemini-2.5-pro': 311.07 }, cap_usd: 40, mode: 'hard_stop' },
  { group_id: 'grp_data', cost: 1391.30, users: 36, sessions: 311, stops: 0, models: { 'gemini-2.5-pro': 1391.30 }, cap_usd: 60, mode: 'warn' },
  { group_id: 'grp_contractors', cost: 903.35, users: 22, sessions: 203, stops: 7, models: { 'gpt-5': 902.40, 'claude-sonnet-5': 0.95 }, cap_usd: 25, mode: 'hard_stop' },
  { group_id: 'grp_svc', cost: 355.47, users: 26, sessions: 141, stops: 0, models: { 'claude-sonnet-5': 355.47 }, cap_usd: null, mode: null },
  { group_id: 'grp_soc', cost: 290.00, users: 14, sessions: 70, stops: 0, models: { 'claude-sonnet-5': 290.00 }, cap_usd: null, mode: null },
  { group_id: null, cost: 122.20, users: 12, sessions: 26, stops: 0, models: { 'claude-sonnet-5': 122.20 }, cap_usd: null, mode: null },
];
const MODELS = [
  { model: 'claude-sonnet-5', provider: 'Anthropic', wire: 'api.anthropic.com', rate_per_mtok: { input: 3.0, output: 15.0, cache_read: 0.3 } },
  { model: 'gemini-2.5-pro', provider: 'Google', wire: 'generativelanguage.googleapis.com', rate_per_mtok: { input: 1.25, output: 10.0, cache_read: 0.31 } },
  { model: 'gpt-5', provider: 'OpenAI', wire: 'api.openai.com', rate_per_mtok: { input: 1.25, output: 10.0, cache_read: 0.125 } },
];
const MIX = { input: 0.62, cache_read: 0.30, output: 0.08 };
const blend = r => MIX.input * r.input + MIX.cache_read * r.cache_read + MIX.output * r.output;
const round2 = n => Math.round(n * 100) / 100;
const tokOf = (model, usd) => { const r = MODELS.find(m => m.model === model).rate_per_mtok; const t = Math.round(usd / blend(r) * 1e6); return { input: Math.round(t * MIX.input), cache_read: Math.round(t * MIX.cache_read), output: Math.round(t * MIX.output) }; };
// usage identities per group: people with devices in the group, service accounts, and 11 ungrouped users with claude-code
const usageUsers = [];
for (const ug of USAGE_GROUPS) {
  let ids;
  if (ug.group_id === 'grp_svc') ids = endpoints.filter(e => e.group_id === 'grp_svc').map(e => ({ name: e.host.replace(/^vm-/, 'svc-'), kind: 'service' }));
  else if (ug.group_id) ids = [...new Set(endpoints.filter(e => e.group_id === ug.group_id && e.owner_kind === 'person').map(e => e.user))].map(n => ({ name: n, kind: 'person' }));
  else ids = [...new Set(endpoints.filter(e => !e.group_id && e.user && e.tools.includes('claude-code')).map(e => e.user))].slice(0, 12).map(n => ({ name: n, kind: 'person' }));
  if (ids.length !== ug.users) throw new Error(`usage users ${ug.group_id} ${ids.length} vs ${ug.users}`);
  // split cost, sessions and per-model cost across users with seeded weights; last user takes the remainder so sums are exact
  const w = ids.map(() => 0.3 + R() * 1.7); const sw = w.reduce((a, b) => a + b, 0);
  const cents = Math.round(ug.cost * 100); let cAcc = 0, sAcc = 0;
  ids.forEach((u, i) => {
    const last = i === ids.length - 1;
    const c = last ? cents - cAcc : Math.floor(cents * w[i] / sw); cAcc += c;
    const s = last ? ug.sessions - sAcc : Math.max(1, Math.floor(ug.sessions * w[i] / sw)); sAcc += s;
    usageUsers.push({ person: u.name, kind: u.kind, group_id: ug.group_id, cost_usd: c / 100, sessions: s });
  });
}
// pin a few named people to specific values within their group (re-balanced against the group's largest other user)
function pinUser(name, cost, sessions) {
  const u = usageUsers.find(x => x.person === name); const others = usageUsers.filter(x => x.group_id === u.group_id && x !== u).sort((a, b) => b.cost_usd - a.cost_usd);
  const dc = round2(cost - u.cost_usd), ds = sessions - u.sessions; u.cost_usd = cost; u.sessions = sessions; others[0].cost_usd = round2(others[0].cost_usd - dc); others[0].sessions -= ds;
}
pinUser('Rahul Iyer', 118.40, 26);
pinUser('Marcus Lee', 212.75, 31);
usageUsers.forEach(u => { const ug = USAGE_GROUPS.find(g => g.group_id === u.group_id); const share = u.cost_usd / ug.cost; const tok = Object.entries(ug.models).map(([m, usd]) => tokOf(m, usd * share)); u.input = tok.reduce((a, t) => a + t.input, 0); u.output = tok.reduce((a, t) => a + t.output, 0); u.cache_read = tok.reduce((a, t) => a + t.cache_read, 0); u.tokens = u.input + u.output + u.cache_read; u.turns = Math.round(u.sessions * (6 + R() * 5)); });
// budget stops (22): digital 9 (incl. Marcus Lee), payments 6, contractors 7
const stops = [];
for (const [gid, n] of [['grp_digital_eng', 9], ['grp_payments_eng', 6], ['grp_contractors', 7]]) {
  const ug = USAGE_GROUPS.find(g => g.group_id === gid);
  const cands = usageUsers.filter(u => u.group_id === gid && u.person !== 'Rahul Iyer').sort((a, b) => b.cost_usd - a.cost_usd);
  for (let i = 0; i < n; i++) {
    const u = gid === 'grp_digital_eng' && i === 0 ? usageUsers.find(x => x.person === 'Marcus Lee') : cands[i + (gid === 'grp_digital_eng' ? 1 : 0)];
    const host = endpoints.find(e => e.user === u.person && e.group_id === gid).host;
    stops.push({ ts: gid === 'grp_digital_eng' && i === 0 ? NOW - 4 * H - 20 * 60 : NOW - Math.floor((0.2 + R() * 6.5) * DAY), sid: mkSid(), person: u.person, host, group_id: gid, cap_usd: ug.cap_usd, cap_scope: 'per_user_24h', spend_usd: round2(ug.cap_usd * (1 + R() * 0.004)), stop_turn: 8 + Math.floor(R() * 30) });
  }
}
stops.sort((a, b) => b.ts - a.ts);
const toolLabel = t => t;
const sessionRows = [];
const mkSession = (sid, e, outcome, started, extra = {}) => {
  const tool = extra.tool !== undefined ? extra.tool : (e.tools[0] || null);
  const dets = detections.filter(d => d.session_id === sid);
  const row = { sid, name: `${tool || 'agent'} · ${extra.workspace || pick(['settlement-recon', 'payments-api', 'mobile-app', 'customer-portal', 'etl-jobs', 'risk-reports', 'ledger-tools'])}`, egress: 3 + Math.floor(R() * 9), actions: 12 + Math.floor(R() * 40), prompts: 4 + Math.floor(R() * 16), dlp: dets.filter(d => ['CARD-PAN', 'PII-NRIC', 'SWIFT-MSG', 'SECRET-IN-PROMPT', 'EXFIL'].includes(d.rule_id)).length, rules: dets.length, denies: dets.filter(d => d.disposition !== 'recorded').length + (extra.extraDenies || 0),
    started, last_seen: started + 600 + Math.floor(R() * 3000), device_id: e.device_id, endpoint_id: e.endpoint_id, host: e.host, owner: e.user, department: e.department, group_id: e.group_id, tool, detections: dets.length, outcome, initial_prompt: extra.prompt || null, workspace: extra.workspace || null };
  sessionRows.push(row); sessionsById[sid] = row; return row;
};
for (const sid of detSessions) {
  const ds = detections.filter(d => d.session_id === sid).sort((a, b) => a.ts - b.ts); const e = hostOf(ds[0].host);
  const hero = sid === HERO_SID;
  mkSession(sid, e, 'detected', ds[0].ts - 300 - Math.floor(R() * 600), hero ? { workspace: 'settlement-recon', prompt: "find why yesterday's card settlement is off by SGD 1,240", extraDenies: 1 } : { tool: ds[0].tool });
}
for (const s of stops) mkSession(s.sid, hostOf(s.host), 'stopped', s.ts - 1800 - Math.floor(R() * 1800));
// clean sample (the other 1,831 clean sessions are counted in totals, not listed)
const cleanHosts = ['LT-SG-2231', 'LT-SG-2231', 'vm-dev-rahul-07', 'LT-SG-1187', 'LT-SG-4402', 'LT-SG-4710', 'vm-etl-nightly-03', ...endpoints.filter(e => e.tools.length && e.agent_state === 'enforcing').slice(0, 23).map(e => e.host)];
cleanHosts.forEach((h, i) => mkSession(mkSid(), hostOf(h), 'clean', NOW - Math.floor((0.1 + i * 0.21) * DAY), h === 'LT-SG-2231' && i === 0 ? { workspace: 'settlement-recon', prompt: 'add a unit test for the settlement batch parser' } : {}));
sessionRows.sort((a, b) => b.started - a.started);
const sessionTotals = { total: 1934, clean: 1861, detected: detSessions.length, stopped: stops.length };
if (sessionTotals.clean + sessionTotals.detected + sessionTotals.stopped !== sessionTotals.total) throw new Error('session totals');

// hero session activity (masked)
const heroActivity = {
  session: HERO_SID,
  origin: { source: 'sandbox', writable: true, profile: 'claude-code', workspace: '~/src/settlement-recon', identity: 'spiffe://' + DOMAIN + '/user/rahul.iyer', initial_prompt: "find why yesterday's card settlement is off by SGD 1,240" },
  boot: { count: 12, items: [{ label: 'egress allow', count: 5 }, { label: 'mcps', count: 3 }, { label: 'dlp rules', count: 4 }] },
  activity: [
    { cat: 'prompt', kind: 'turn', label: "find why yesterday's card settlement is off by SGD 1,240", detail: 'claude-sonnet-5', count: 1, verdict: 'allow', severity: null, offset: -300, rule_id: null, reason: null, owasp: null },
    { cat: 'file_read', kind: 'read', label: 'Read 4 files under ./recon', detail: 'recon/batch.py …', count: 4, verdict: 'allow', severity: null, offset: -260, rule_id: null, reason: null, owasp: null },
    { cat: 'agent', kind: 'tool_call', label: 'postgres-mcp.query via Aegis Bridge', detail: 'SELECT * FROM cards.txn_ledger WHERE settle_date = current_date - 1', count: 1, verdict: 'allow', severity: null, offset: -40, rule_id: null, reason: null, owasp: null },
    { cat: 'detection', kind: 'CARD-PAN', label: 'Card number (PAN) in agent context', detail: `1,240 rows · pan=${PAN} · nric=${NRIC}`, count: 1, verdict: 'block', severity: 'critical', offset: 0, rule_id: 'CARD-PAN', reason: 'Blocked before the prompt left the sandbox (dlp-card-pan, dlp-nric)', owasp: null },
    { cat: 'blocked', kind: 'egress', label: 'Egress to pastebin.com', detail: 'pastebin.com:443', count: 1, verdict: 'block', severity: null, offset: 25, rule_id: null, reason: 'Not in the CUE allow-list', owasp: null },
  ],
};

// ---- usage summary / models ------------------------------------------------------------------------
const byModel = MODELS.map(m => {
  const usd = round2(USAGE_GROUPS.reduce((a, g) => a + (g.models[m.model] || 0), 0));
  const t = tokOf(m.model, usd);
  const groups = USAGE_GROUPS.filter(g => g.models[m.model]).map(g => ({ group_id: g.group_id, cost_usd: g.models[m.model] })).sort((a, b) => b.cost_usd - a.cost_usd);
  return { ...m, cost_usd: usd, input_tokens: t.input, output_tokens: t.output, cache_read_tokens: t.cache_read, sessions: Math.round(USAGE_GROUPS.reduce((a, g) => a + g.sessions * ((g.models[m.model] || 0) / g.cost), 0)), users: usageUsers.filter(u => USAGE_GROUPS.find(g => g.group_id === u.group_id).models[m.model]).length, groups: groups.length, top_groups: groups.slice(0, 3) };
});
// make model sessions sum to 1,934 exactly
{ const d = 1934 - byModel.reduce((a, m) => a + m.sessions, 0); byModel[0].sessions += d; }
const usageSummary = {
  cost_usd: round2(byModel.reduce((a, m) => a + m.cost_usd, 0)), users: usageUsers.length, sessions: USAGE_GROUPS.reduce((a, g) => a + g.sessions, 0),
  input_tokens: byModel.reduce((a, m) => a + m.input_tokens, 0), output_tokens: byModel.reduce((a, m) => a + m.output_tokens, 0), cache_read_tokens: byModel.reduce((a, m) => a + m.cache_read_tokens, 0),
  hard_stops: stops.length, turns: usageUsers.reduce((a, u) => a + u.turns, 0), rate_card_id: 'smb-illustrative-2026-09',
};
usageSummary.tokens = usageSummary.input_tokens + usageSummary.output_tokens + usageSummary.cache_read_tokens;
const rahulToday = { spend_usd: 18.40, cap_usd: 40, cap_scope: 'per_user_24h', mode: 'hard_stop' };

// ---- people: personas get full records --------------------------------------------------------------
const personaIds = { 'Tan Wei Ling': 'weiling', 'Arjun Menon': 'arjun', 'Priscilla Goh': 'priscilla', 'Rahul Iyer': 'rahul' };
people.forEach(p => { if (personaIds[p.name]) p.login = personaIds[p.name]; });

// ---- assemble -----------------------------------------------------------------------------------------
const canonical = {
  $comment: 'Straits Meridian Bank — FICTIONAL demo tenant. Generated by scripts/gen-canonical.mjs. Do not hand-edit; change the generator and re-run.',
  meta: { tenant: 'straits-meridian', org: { id: 'org_straits_meridian', name: 'Straits Meridian Bank' }, domain: DOMAIN, now: NOW, window_from: FROM, window_to: NOW, data_as_of: NOW - 120, display_offset_s: SGT, fictional: true },
  groups: GROUPS.map(({ laptops, vms, cue, older, tools, ...g }) => ({ ...g, recert_due: g.recert_due || null, member_count: endpoints.filter(e => e.group_id === g.id).length })),
  people, services, providers, endpoints, sensors, dlp_rules, cues, bridge, mcp_discovered, skills,
  detection_families: FAMILIES.map(({ split, ...f }) => f), detections, blast,
  sessions: { totals: sessionTotals, rows: sessionRows, activity: { [HERO_SID]: heroActivity } },
  usage: { summary: usageSummary, by_model: byModel, by_group: USAGE_GROUPS, by_user: usageUsers.sort((a, b) => b.cost_usd - a.cost_usd), stops, rahul_today: rahulToday },
  shadow_previous: { hits: 97420, shadow_hits: 5261 },
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(canonical, null, 1));
console.log('canonical written:', path.relative(root, outFile), (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB',
  '· endpoints', endpoints.length, '· services', services.length, '· detections', detections.length, '· sessions listed', sessionRows.length, '· usage users', usageUsers.length, '· usage USD', usageSummary.cost_usd);
