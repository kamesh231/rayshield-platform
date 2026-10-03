// Client for the Fleet backend (aegis-fleet-api). Live mode only (DEMO_TENANT=fleet).
// Every call is server-to-server; the browser never talks to Fleet directly.
const BASE = (process.env.AEGIS_API_URL || 'https://aegis-fleet-api-production.up.railway.app').replace(/\/+$/, '');
export const FLEET_URL = BASE;

// One request. Returns { status, json, setCookie } and never throws (status 0 = network error or timeout).
export async function fleet(path, { token, method = 'GET', body, cookie, timeoutMs = 10000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const text = await r.text(); let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: r.status, json, setCookie: r.headers.get('set-cookie') };
  } catch (e) {
    return { status: 0, json: null, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(t); }
}

const DAY = 86400;
const cache = new Map(); // key -> { at, data }
const TTL = 30 * 1000;

// Everything the console needs for one signed-in viewer, fetched in parallel. Endpoints that need a
// token are skipped (null) for preview sign-ins; anything that fails is null and the seed shows it empty.
export async function snapshot(token) {
  const key = token || 'public';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const now = Math.floor(Date.now() / 1000), from = now - 7 * DAY, w = `from=${from}&to=${now}`, prev = `from=${from - 7 * DAY}&to=${from}`;
  const get = async (path, needsToken) => {
    if (needsToken && !token) return null;
    const r = await fleet(path, { token });
    return r.status >= 200 && r.status < 300 ? r.json : null;
  };
  const jobs = {
    summary: get(`/api/discovery/summary?${w}`), summaryPrev: get(`/api/discovery/summary?${prev}`),
    services: get(`/api/discovery/by_service?${w}`), endpoints: get(`/api/discovery/by_endpoint?${w}`), users: get(`/api/discovery/by_user?${w}`),
    categories: get(`/api/discovery/by_category?${w}`), timeseries: get(`/api/discovery/timeseries?${w}`), changes: get(`/api/discovery/changes?${w}`),
    sensors: get(`/api/sensors?${w}`), sessions: get(`/api/sessions?${w}`), posture: get(`/api/posture?${w}`), risks: get(`/api/risks/top?${w}`),
    policies: get('/api/policies'), approvals: get('/api/approvals'), devicesPublic: get('/api/devices'), mcps: get('/v1/mcps'),
    usage: get(`/api/usage/summary?${w}`), usageUsers: get(`/api/usage/by_user?${w}`), usageRecent: get(`/api/usage/recent?${w}`),
    decisions: get('/api/stream/decisions'), agents: get(`/api/agents?${w}`), settings: get('/api/settings'),
    // v2.1, token required
    me: get('/api/me', true), devicesSummary: get(`/api/devices/summary?${w}`, true), devices: get('/api/devices?limit=500', true),
    detections: get(`/api/detections?${w}&limit=500`, true), detectionsSummary: get(`/api/detections/summary?${w}`, true),
    usageByModel: get(`/api/usage/by_model?${w}`, true), usageByGroup: get(`/api/usage/by_group?${w}`, true), budgets: get('/api/usage/budgets', true),
  };
  const keys = Object.keys(jobs), vals = await Promise.all(Object.values(jobs));
  const data = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  // Session detail for the most recent sessions (the console opens a session from the list).
  const recent = (Array.isArray(data.sessions) ? data.sessions : []).slice().sort((a, b) => b.last_seen - a.last_seen).slice(0, 15);
  const acts = await Promise.all(recent.map(s => get(`/api/session/${encodeURIComponent(s.sid)}/activity`)));
  data.activity = Object.fromEntries(recent.map((s, i) => [s.sid, acts[i]]));
  data.fetchedAt = now;
  data.reachable = keys.some(k => data[k] != null);
  cache.set(key, { at: Date.now(), data });
  return data;
}

export function clearCache(token) { cache.delete(token || 'public'); }
