// RayShield console on real data from the Fleet backend (DEMO_TENANT=fleet).
// The console UI is the same build as the bank demo (public/console-bank/index.html); its data constants
// come from Fleet through src/live/seed.js, and public/console-live/bridge-live.js replaces the demo bridge.
// None of the demo routes or demo state are loaded in this mode.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fleet, snapshot, clearCache, FLEET_URL } from './fleet.js';
import { buildLiveSeed } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = express();
app.use(express.json());
const ORG = process.env.LIVE_ORG_NAME || 'Fleet (live)';
const PREVIEW = (process.env.LIVE_PREVIEW || 'on') !== 'off';
const PREVIEW_PASSWORD = process.env.LIVE_PREVIEW_PASSWORD || 'demo';
const rid = () => crypto.randomUUID();
const apiErr = (res, status, code, error) => res.status(status).json({ error, code, request_id: rid() });

// Console roles. Writes stay off until the matching Fleet APIs are connected, so every role is read-only here.
const ROLES = {
  admin: { console: 'Administrator', label: 'Admin' }, security: { console: 'Security', label: 'Security' },
  ciso: { console: 'Administrator', label: 'CISO' }, developer: { console: 'Security', label: 'Developer' },
};
const READ_ONLY = { approveMcp: false, onboardMcp: false, decideMcp: false, removeMcp: false, editCue: false, publishCue: false, deleteCue: false, assignPolicy: false, createGroup: false, setStatus: false, settingsWrite: false, reset: false, viewAll: true, scope: 'org', terminal: [], terminalMode: 'none' };

// --- sessions (in memory; a restart signs everyone out) -----------------------------------------
const sessions = new Map(); // sid -> { user, token, tokenExp, refreshCookie }
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const current = req => sessions.get(cookieOf(req).rs_live) || null;
function startSession(res, s) {
  const sid = crypto.randomBytes(18).toString('hex'); sessions.set(sid, s);
  res.setHeader('Set-Cookie', `rs_live=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? '; Secure' : ''}`);
}
const refreshCookieFrom = setCookie => { const m = /refresh_token=([^;]+)/.exec(setCookie || ''); return m ? 'refresh_token=' + m[1] : null; };

// Fleet access tokens last 15 minutes; refresh with the stored refresh cookie when close to expiry.
async function tokenFor(s) {
  if (!s.token) return null;
  if (s.tokenExp - Date.now() > 60000) return s.token;
  if (!s.refreshCookie) return s.token;
  const r = await fleet('/api/auth/refresh', { method: 'POST', cookie: s.refreshCookie });
  if (r.status === 200 && r.json && r.json.access_token) {
    s.token = r.json.access_token; s.tokenExp = Date.now() + (r.json.expires_in || 900) * 1000;
    s.refreshCookie = refreshCookieFrom(r.setCookie) || s.refreshCookie;
  }
  return s.token;
}

// --- auth ---------------------------------------------------------------------------------------
app.post(['/api/login', '/api/auth/login'], async (req, res) => {
  const { username, email, password } = req.body || {};
  const id = String(email || username || '').trim();
  if (!id || !password) return apiErr(res, 400, 'INVALID_PARAMETER', 'Enter your email (or a preview username) and password.');
  if (id.includes('@')) {
    // Real Fleet account
    const r = await fleet('/api/auth/login', { method: 'POST', body: { email: id, password } });
    if (r.status !== 200 || !r.json || !r.json.access_token) return apiErr(res, r.status === 0 ? 502 : 401, r.status === 0 ? 'UPSTREAM_UNAVAILABLE' : 'UNAUTHENTICATED', r.status === 0 ? 'Fleet is not reachable right now.' : (r.json && r.json.error) || 'Wrong email or password.');
    const token = r.json.access_token;
    const me = await fleet('/api/me', { token });
    const m = me.json || {};
    const role = ROLES[m.role] ? m.role : 'security';
    const user = { id: m.id || id, email: m.email || id, name: m.name || id, role, roleLabel: ROLES[role].label, permissions: m.permissions || [], fleet: true, landing: '/console' };
    startSession(res, { user, token, tokenExp: Date.now() + (r.json.expires_in || 900) * 1000, refreshCookie: refreshCookieFrom(r.setCookie) });
    return res.json({ ok: true, user });
  }
  // Preview sign-in: public Fleet endpoints only, until Fleet accounts are available
  if (!PREVIEW || !['admin', 'security', 'ciso'].includes(id.toLowerCase()) || password !== PREVIEW_PASSWORD) return apiErr(res, 401, 'UNAUTHENTICATED', 'Wrong email or password.');
  const role = id.toLowerCase();
  const user = { id: 'preview-' + role, email: null, name: 'Preview · ' + ROLES[role].label, role, roleLabel: ROLES[role].label, permissions: [], fleet: false, landing: '/console' };
  startSession(res, { user, token: null, tokenExp: 0, refreshCookie: null });
  res.json({ ok: true, user });
});
app.post(['/api/logout', '/api/auth/logout'], async (req, res) => {
  const sid = cookieOf(req).rs_live, s = sid && sessions.get(sid);
  if (s && s.refreshCookie) fleet('/api/auth/logout', { method: 'POST', cookie: s.refreshCookie, token: s.token }).catch(() => {});
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', 'rs_live=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => { const s = current(req); res.json({ user: s ? s.user : null }); });

// --- live helpers -------------------------------------------------------------------------------
app.get('/api/live/status', async (req, res) => {
  const s = current(req); if (!s) return apiErr(res, 401, 'UNAUTHENTICATED', 'Not signed in.');
  const h = await fleet('/health', { timeoutMs: 5000 });
  res.json({ fleet_url: FLEET_URL, fleet_health: h.status === 200 ? 'ok' : 'unreachable (' + (h.error || h.status) + ')', signed_in_to_fleet: !!s.user.fleet, role: s.user.role });
});
app.post('/api/live/refresh', async (req, res) => { const s = current(req); if (!s) return apiErr(res, 401, 'UNAUTHENTICATED', 'Not signed in.'); clearCache(await tokenFor(s)); res.json({ ok: true }); });
// The console asks for these; in live mode there is nothing saved locally and no demo event log.
app.get('/api/state', (req, res) => res.json({ epoch: 'live', events: [] }));
app.get('/api/console/state', (req, res) => res.json({ saved_at: null, slices: {} }));
app.post('/api/console/state', (req, res) => apiErr(res, 403, 'FORBIDDEN', 'Changes are not available in the live preview yet.'));
app.get('/api/inbox', (req, res) => res.json({ unread: 0, pending_decisions: 0, needs_decision: [], my_requests: [], updates: [] }));
app.get('/api/control/mcp-bridge', (req, res) => res.json([]));
// Live updates: relay Fleet's SSE stream for Fleet sign-ins (browsers can't send its Bearer header).
app.get('/api/stream', async (req, res) => {
  const s = current(req); if (!s) return res.status(401).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const ka = setInterval(() => res.write(': ka\n\n'), 25000);
  let ctl = null;
  const token = await tokenFor(s);
  if (token) {
    ctl = new AbortController();
    fetch(FLEET_URL + '/api/stream', { headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' }, signal: ctl.signal })
      .then(async r => { if (!r.ok || !r.body) return; for await (const chunk of r.body) res.write(chunk); })
      .catch(() => {});
  }
  req.on('close', () => { clearInterval(ka); if (ctl) ctl.abort(); });
});
app.all('/api/*', (req, res) => apiErr(res, 404, 'NOT_FOUND', `${req.method} ${req.path} is not connected in the live preview yet.`));

// --- pages --------------------------------------------------------------------------------------
app.use('/static', express.static(path.join(root, 'public')));
app.use('/console/assets', express.static(path.join(root, 'public/console/assets')));
app.use('/console-bank', express.static(path.join(root, 'public/console-bank')));
app.use('/console-live', express.static(path.join(root, 'public/console-live')));
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c');

app.get('/health', (req, res) => res.json({ ok: true, mode: 'live', fleet: FLEET_URL }));
app.get('/', (req, res) => res.redirect(current(req) ? '/console' : '/login'));
app.get('/login', (req, res) => {
  let html = fs.readFileSync(path.join(root, 'public/login.html'), 'utf8');
  html = html.replace('Agentic control plane — demo tenant · Northwind Capital', `Agentic control plane — ${ORG} · live data`);
  const a = html.indexOf('<div class="accts">'), b = html.indexOf('<div class="foot">');
  if (a > 0 && b > a) html = html.slice(0, a) + html.slice(b);
  html = html.replace('All accounts use password <code>demo</code>', 'Sign in with your Fleet account email' + (PREVIEW ? ', or a preview login' : '') + '.');
  html = html.replace('<label for="u">Username</label>', '<label for="u">Email</label>').replace('autocomplete="username"', 'autocomplete="username" placeholder="you@company.com"');
  res.type('html').send(html);
});
app.get('/console', async (req, res) => {
  const s = current(req); if (!s) return res.redirect('/login');
  const token = await tokenFor(s);
  const F = await snapshot(token);
  const viewer = s.user;
  const seed = buildLiveSeed(F, viewer);
  const demoUser = { id: viewer.id, name: viewer.name, role: ROLES[viewer.role].console, roleLabel: viewer.roleLabel, roleClaim: viewer.role, perms: READ_ONLY, title: viewer.roleLabel + (viewer.fleet ? '' : ' · preview'), demoBar: [], holders: {}, tenant: ORG, email: viewer.email, fleet: viewer.fleet, permissions: viewer.permissions };
  let html = fs.readFileSync(path.join(root, 'public/console-bank/index.html'), 'utf8');
  html = html.split('/console-bank/bridge-bank.js').join('/console-live/bridge-live.js');
  html = html.split('Straits Meridian Bank (fictional)').join(ORG).split('Straits Meridian Bank').join(ORG).split('Demo data · fictional').join('Live data · Fleet API');
  html = html.split('__DEMO_USER_JSON__').join(safeJson(demoUser)).split('__DEMO_SEED_JSON__').join(safeJson(seed)).split('__DEMO_USER_NAME__').join(viewer.name);
  res.type('html').send(html);
});
app.get(['/me', '/terminal'], (req, res) => res.redirect('/console'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RayShield console (live) on :${PORT} · Fleet ${FLEET_URL} · preview sign-in ${PREVIEW ? 'on' : 'off'}`));
