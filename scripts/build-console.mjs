// Builds public/console/ from the Claude Design export (design/rayshield-console.bundle.html).
// Re-run after exporting a new design: `npm run build:console`.
// Every patch must match exactly once, so a changed design fails loudly instead of silently.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'design/rayshield-console.bundle.html'), 'utf8');
const outDir = path.join(root, 'public/console');
const assetDir = path.join(outDir, 'assets');
fs.mkdirSync(assetDir, { recursive: true });

const grab = type => {
  const m = src.match(new RegExp(`<script type="${type}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error('missing ' + type);
  return JSON.parse(m[1]);
};
const manifest = grab('__bundler/manifest');
let template = grab('__bundler/template');

// 1. Unpack assets and point the template at /console/assets/<uuid>.<ext>
const EXT = { 'image/svg+xml': 'svg', 'text/javascript': 'js', 'font/woff2': 'woff2' };
const names = {};
for (const [uuid, entry] of Object.entries(manifest)) {
  let buf = Buffer.from(entry.data, 'base64');
  if (entry.compressed) buf = zlib.gunzipSync(buf);
  const head = buf.slice(0, 200).toString();
  const ext = EXT[entry.mime] || 'bin';
  // Name the three scripts so the page is readable.
  const name = head.includes('react-dom.production') ? 'react-dom.js' : head.includes('react.production') ? 'react.js' : head.includes('dc-runtime') ? 'dc-runtime.js' : `${uuid}.${ext}`;
  fs.writeFileSync(path.join(assetDir, name), buf);
  names[uuid] = name;
}
for (const [uuid, name] of Object.entries(names)) template = template.split(uuid).join('/console/assets/' + name);

// 2. Load React locally (the runtime would otherwise fetch it from a CDN) and the demo bridge first.
const once = (hay, needle, repl, label) => {
  const n = hay.split(needle).length - 1;
  if (n !== 1) throw new Error(`patch "${label}" matched ${n} times`);
  return hay.replace(needle, () => repl);
};
template = once(template, '<script src="/console/assets/dc-runtime.js"></script>',
  '<script src="/console/assets/react.js"></script><script src="/console/assets/react-dom.js"></script>' +
  '<script>window.__demoUser = __DEMO_USER_JSON__;</script><script src="/console/bridge.js"></script>' +
  '<script src="/console/assets/dc-runtime.js"></script>', 'runtime scripts');

// 3. Signed-in user in the sidebar (was hard-coded to Priya Nair). Server fills __DEMO_USER_NAME__.
template = once(template, '<div style="font-size:12px;font-weight:500">Priya Nair</div>',
  '<div style="font-size:12px;font-weight:500">__DEMO_USER_NAME__</div>', 'sidebar user');

// Platform sensors: remove the "NE / host" row (a self-contained <div> of spans).
{ const i = template.indexOf('>NE / host</span>');
  if (i < 0 || template.split('>NE / host</span>').length !== 2) throw new Error('patch "remove NE / host row" did not match exactly once');
  const a = template.lastIndexOf('<div ', i), b = template.indexOf('</div>', i) + 6;
  if (template.slice(a, b).includes('<div', 5)) throw new Error('patch "remove NE / host row": unexpected nested markup');
  template = template.slice(0, a).replace(/\n[ \t]*$/, '') + template.slice(b); }

// 4. Patch the component logic.
const appRe = /(<script type="text\/x-dc"[^>]*>)([\s\S]*?)(<\/script>)/;
let app = template.match(appRe)[2];

// Role/dataState come from the signed-in user, not the design's default prop.
app = once(app, "const role = p.role ?? 'Security', directory = p.directoryConnected ?? true, dataState = p.dataState ?? 'normal';",
  "const role = (window.__demoUser && window.__demoUser.role) || p.role || 'Security', directory = p.directoryConnected ?? true, dataState = p.dataState ?? 'normal';", 'role from user');

app = once(app, "['filesystem','read_file · list_directory · write_file',null]];",
  "['filesystem','read_file · list_directory · write_file',null],['linear','list_issues · get_issue · update_issue',null]];", 'mcp catalog');

// Hero machines used by the scripted storylines.
app = once(app, 'const DET_EVID=',
  'const DEMO_EP_BASE = DET_EPS.length; DET_EPS.push(["dev-patel-mbp","Dev Patel","person",0,0,"engineering"],["vm-ci-build-214","svc-ci","service",1,0,"engineering"]); window.__DEMO_EP = { "dev-patel-mbp": DEMO_EP_BASE, "vm-ci-build-214": DEMO_EP_BASE + 1 };\nconst DET_EVID=', 'hero endpoints');

// Scripted detections are appended to the recorded ones.
app = once(app, 'const allRows = DET_ROWS.map(r => {', 'const allRows = [...DET_ROWS, ...(this.state.demoDet || [])].map(r => {', 'det rows');
app = once(app, 'obs: rule[4], dc: r[5] };', 'obs: rule[4], dc: r[5], extra: r[6] || null };', 'det extra');
app = once(app, '      return dd;\n    };\n    // ---- detlist ----',
  `      if (x.extra) { const e = x.extra;
        if (e.decoded && dd.ddDecode) dd.decode = { encoding: 'base64', encoded: wrap(btoa(e.decoded), 4), decoded: e.decoded, where: e.where || (dd.decode && dd.decode.where) };
        if (e.exfil && dd.ddExfil) dd.exfil = e.exfil;
        if (e.content && dd.ddContent) dd.content = e.content;
        if (e.teaser) dd.teaser = e.teaser; }
      return dd;
    };
    // ---- detlist ----`, 'det evidence override');

app = once(app, 'componentDidMount() {\n    this._timer', 'componentDidMount() {\n    if (window.__demoBridge) window.__demoBridge.attach(this);\n    this._timer', 'bridge attach');

// MCP decisions go to the server so the developer terminal and other consoles see them.
const approveStart = app.indexOf('  approveMcp(m, targets) {');
const approveEnd = app.indexOf('  buildFeed(S) {');
if (approveStart < 0 || approveEnd < approveStart) throw new Error('approveMcp not found');
let approve = app.slice(approveStart, approveEnd);
approve = approve.replace('  approveMcp(m, targets) {\n', `  approveMcp(m, targets, fromServer) {
    const B = window.__demoBridge;
    if (!fromServer && B && !B.canAct()) return;
    if (!fromServer && B) B.post({ type: 'mcpDecision', id: m.id, name: m.name, decision: 'approved', targets: targets.map(t => t.id) });
    const __who = (window.__demoUser && window.__demoUser.name) || 'Priya Nair';
`).split("'Priya Nair'").join('__who').split('approved by Priya Nair').join("approved by ' + __who + '");
approve += `  denyMcp(m, fromServer) {
    const B = window.__demoBridge;
    if (!fromServer && B && !B.canAct()) return;
    if (!fromServer && B) B.post({ type: 'mcpDecision', id: m.id, name: m.name, decision: 'denied' });
    this.setState(s => ({ mcp: s.mcp.map(x => x.id === m.id ? { ...x, decision: 'denied' } : x), mcpLast: { id: m.id, decision: 'denied' } }));
  }
`;
app = app.slice(0, approveStart) + approve + app.slice(approveEnd);
app = once(app, "deny: () => this.setState(s => ({ mcp: s.mcp.map(x => x.id === m.id ? { ...x, decision: 'denied' } : x), mcpLast: { id: m.id, decision: 'denied' } })),",
  'deny: () => this.denyMcp(m),', 'deny handler');

template = template.replace(appRe, (_, a, __, c) => a + app + c);

// Remove the "Made with Claude Design" branding badge (self-contained div) for a client-facing demo.
{
  const marker = '<div id="__claude_design_branding">';
  const start = template.indexOf(marker);
  if (start >= 0) {
    // Balance <div> tags from the marker to find its matching close.
    let depth = 0, i = start;
    const re = /<\/?div\b[^>]*>/gi; re.lastIndex = start;
    let m, end = -1;
    while ((m = re.exec(template))) {
      if (m[0][1] === '/') { depth--; if (depth === 0) { end = re.lastIndex; break; } }
      else depth++;
    }
    if (end > start) template = template.slice(0, start) + template.slice(end);
    else console.warn('branding badge open tag found but close not matched — left in place');
  }
}
// Hide the design-review-only annotation prop from anyone poking at the page.
fs.writeFileSync(path.join(outDir, 'index.html'), template);
console.log('console built:', Object.keys(names).length, 'assets,', Math.round(template.length / 1024), 'KB page');

// Tenant consoles: build the Straits Meridian Bank console from the newer design source
// (design/console-src/) into public/console-bank/. Northwind's console above is unchanged.
await import('./apply-tenant.mjs');
