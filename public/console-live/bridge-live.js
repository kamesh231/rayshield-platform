// Live bridge for the RayShield console on Fleet data (DEMO_TENANT=fleet).
// Replaces the demo bridge: Home and the Discover overview are computed from the real seed, every
// change is refused (read-only until the matching Fleet APIs are connected), and Fleet's live stream
// is shown as toasts. No demo story or demo numbers live here.
(function () {
  'use strict';
  var U = window.__demoUser || { name: 'Viewer', perms: {} };
  var S = window.__S || {};
  var L = S.LIVE || {};
  var comp = null;
  var INK = '#0B1220', WARN = '#B4530A', CRIT = '#C4293A', TEAL = '#4F5BD5', GREEN = '#157F4E', GOLD = '#8a6d1f';
  function fmt(n) { n = Number(n) || 0; return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n)); }
  function money(n) { return 'USD ' + (Number(n) || 0).toFixed(2); }
  function go(page, extra) { return function () { comp.go(page, extra); window.scrollTo(0, 0); }; }
  function svcByName(name) { return (S.SERVICES || []).find(function (s) { return s.name === name; }); }
  function openSvc(name) { return function () { var s = svcByName(name); if (s) comp.setState({ page: 'services', statusFilter: 'all', panel: { type: 'service', id: s.id } }); }; }
  function signOut() { fetch('/api/logout', { method: 'POST' }).then(function () { location.href = '/login'; }); }
  function row(label, sub, value, color, def, g) { return { label: label, sub: sub, value: String(value), valueColor: color || INK, def: def || label, go: g || function () {} }; }
  function att(kind, color, text, meta, g) { return { kind: kind, color: color, text: text, meta: meta || '', go: g || function () {} }; }
  function ago(ts) { var s = Math.max(0, Math.floor(Date.now() / 1000) - ts); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'; }

  function facts() {
    var svcs = S.SERVICES || [], st = comp.state;
    var status = function (s) { return comp.svcStatus ? comp.svcStatus(s) : s.status; };
    var unl = svcs.filter(function (s) { return status(s) === 'Unlabelled'; });
    var list = S.SESSION_LIST || [], T = S.SESSION_TOTALS || {};
    var blocked = list.reduce(function (a, s) { return a + ((s.fixed || {}).blk || 0); }, 0);
    var pols = S.POLICIES || [], bridge = st.bridge || S.BRIDGE0 || [];
    return { svcs: svcs, unl: unl, eps: (S.ENDPOINTS || []).length, devices: (S.FLEET || []).length, sessions: T.total || 0, detected: T.detected || 0, clean: T.clean || 0, blocked: blocked,
      detections: (S.DET_ROWS || []).length, usage: S.USAGE_SUMMARY || {}, polEnforce: pols.filter(function (p) { return p.mode === 'Enforce'; }).length, polTotal: pols.length,
      mcpOn: bridge.filter(function (b) { return b.status === 'Onboarded'; }).length, mcpTotal: bridge.length, agents: (L.agents || []).length,
      sensorsDown: ((S.TEXT || {}).sensors || []).filter(function (x) { return x.health !== 'reporting'; }) };
  }

  // ---------- Home (same layout for every role; numbers are Fleet's, last 7 days) ----------
  window.__rsHome = function (c, page, role, x) {
    comp = comp || c;
    var f = facts(), u = f.usage, isCiso = S.HOME_KEY === 'ciso';
    var posture = L.posture || {};
    var planes = [
      { name: 'Discover', verb: 'observed', linkLabel: 'Open AI services', go: go('services', { statusFilter: 'all' }), rows: [
        row('AI services detected', 'last 7 days · Shield', f.svcs.length, INK, 'Distinct AI services seen by Fleet discovery', go('services', { statusFilter: 'all' })),
        row('Awaiting a governance decision', 'no status set yet', f.unl.length, f.unl.length ? WARN : INK, 'Services with no governance status', go('services', { statusFilter: 'Unlabelled' })),
        row('Endpoints observed', 'by network discovery', f.eps, INK, 'Endpoints with at least one AI request', go('endpoints')) ] },
      { name: 'Protect', verb: 'enforced', linkLabel: 'Open sessions', go: go('sessions'), rows: [
        row('Agent sessions', 'clean ' + f.clean + ' · with blocks ' + f.detected, f.sessions, INK, 'Sandbox sessions reported by Fleet', go('sessions')),
        row('Actions blocked', 'egress, files and commands', f.blocked, f.blocked ? CRIT : INK, 'Denied actions across sessions', go('sessions')),
        row('Detections', L.detectionsFrom || '', f.detections, f.detections ? WARN : INK, 'Detections in the last 7 days', go('detections')) ] },
      { name: isCiso ? 'Posture' : 'Usage and control', verb: isCiso ? 'for the CISO' : 'spend · policy', linkLabel: isCiso ? 'Open usage' : 'Open policies', go: go(isCiso ? 'usage' : 'roles'), rows: [
        isCiso && posture.score != null ? row('Posture score', 'Fleet composite, higher is better', posture.score, posture.score >= 70 ? GREEN : posture.score >= 40 ? WARN : CRIT, 'AI posture score from Fleet', go('home'))
          : row('Agent spend', fmt(u.tokens) + ' tokens · ' + (u.sessions || 0) + ' sessions', money(u.cost), INK, 'Model cost in the last 7 days', go('usage')),
        row('Policies enforcing', f.polTotal + ' policies in Fleet', f.polEnforce + ' / ' + f.polTotal, INK, 'Policies in Enforced state', go('roles')),
        row('MCP servers onboarded', f.mcpTotal ? f.mcpTotal + ' in the registry' : 'registry empty', f.mcpOn, INK, 'Approved in the Fleet MCP registry', go('bridge')) ] },
    ];
    var attn = [];
    (L.risks || []).slice(0, 4).forEach(function (r) { attn.push(att('RISK', r.risk >= 70 ? CRIT : WARN, r.service + ' · risk ' + r.risk + (r.recommend ? ' · recommended: ' + r.recommend : ''), r.people ? r.people + ' people' : 'Discover', openSvc(r.service))); });
    (L.approvals || []).filter(function (a) { return a.state === 'pending'; }).slice(0, 3).forEach(function (a) { attn.push(att('APPROVAL', GOLD, a.agent + ' wants to ' + a.action + ' (' + a.identity + ' on ' + a.device + ')', (a.reach || '') + ' · ' + ago(a.created_ts), function () {})); });
    (L.changes || []).filter(function (c) { return c.is_new; }).slice(0, 3).forEach(function (c) { attn.push(att('NEW', TEAL, 'New AI service seen: ' + c.ai_service, 'Discover', openSvc(c.ai_service))); });
    f.sensorsDown.forEach(function (x) { attn.push(att('SYSTEM', CRIT, 'Sensor ' + x.name + ' is not reporting', 'last seen ' + x.lastSeen, go('sensors'))); });
    if (!attn.length) attn.push(att('INFO', TEAL, 'Nothing needs attention in the last 7 days', '', function () {}));
    return { signOut: signOut, openInbox: function () { toast('The approvals inbox is not connected in the live preview yet.'); }, inboxBadge: '', inboxBg: 'transparent', inboxColor: '#5b6773',
      planes: planes, homeAttention: attn, homeBannerN: String(f.blocked), homeBannerTitle: 'Agent actions blocked in the last 7 days',
      homeBannerSub: f.sessions + ' sessions · ' + f.agents + ' agents · ' + f.detections + ' detections', radBadge: '' };
  };

  // ---------- Discover overview ----------
  window.__rsOverview = function (c, LL) {
    comp = comp || c;
    var T = S.TEXT || {}, f = facts();
    var attention = (L.risks || []).slice(0, 3).map(function (r) { var s = svcByName(r.service); return att('GOVERNANCE', GOLD, r.service + ' · risk ' + r.risk + (r.recommend ? ' · ' + r.recommend : ''), s ? fmt(s.daily * LL.scale) + ' requests' : '', s ? LL.openService(s) : null); });
    if (LL.unreviewed > 0) attention.push(att('GOVERNANCE', GOLD, LL.unreviewed + ' active services have no governance status', LL.reviewed + ' of ' + f.svcs.length + ' reviewed', go('services', { statusFilter: 'Unlabelled' })));
    f.sensorsDown.forEach(function (x) { attention.push(att('SYSTEM', '#b42318', 'Sensor ' + x.name + ' is not reporting', 'last seen ' + x.lastSeen, go('sensors'))); });
    var ratio = f.eps ? LL.W.ep / f.eps : 1;
    var sensors = (T.sensors || []).map(function (x) { return { name: x.name, desc: x.desc, endpoints: Math.round(x.endpoints * ratio), services: Math.min(x.services, LL.W.svc), servicesTip: 'AI services this sensor observed', requests: fmt(x.requests * LL.scale), lastSeen: x.lastSeen, health: x.health, color: x.color }; });
    return { attention: attention, sensors: sensors, freshness: T.freshness, decisions: (c.state.decisions || []).slice(0, 4), svcTotal: String(f.svcs.length), dirProvider: (T.directory || {}).provider,
      platSbxRecords: (T.platformSandbox || {}).records, platSbxUnauth: (T.platformSandbox || {}).unauthorised, platSbxVms: (T.platformSandbox || {}).vms, radRootsLine: 'No blast-radius data from Fleet yet' };
  };

  // ---------- detection evidence (redacted for the CISO by the server) ----------
  window.__rsEnrich = function (dd, x) {
    var ev = (S.DET_EVIDENCE || {})[x.id]; if (!ev) return;
    dd.ddDecode = false; dd.ddContent = false; dd.ddExfil = false; dd.ddEgress = false; dd.ddPersist = false; dd.ddUndisclosed = false;
    if (ev.redacted) { dd.teaser = ev.teaser; return; }
    if (ev.content) { dd.ddContent = true; dd.content = ev.content; }
    dd.teaser = ev.teaser;
  };
  window.__rsExp = function () { return ''; };

  // ---------- read-only actions ----------
  var READONLY = 'Read-only in the live preview: this change needs a Fleet API that is not connected yet.';
  function no() { toast(READONLY); return false; }
  window.__demoBridge = {
    bank: true, live: true,
    has: function () { return false; },
    can: function () { return no(); },
    canAct: function () { return true; },
    onSetStatus: no, onApproveMcp: no, onDenyMcp: no, onBridgeDecision: no, onAccessToggle: no, onOnboard: no, onSuspendMcp: no, onDeboardMcp: no,
    onPublishGen: function () { return no(); },
    attach: function (instance) { comp = instance; window.__rsLiveComp = instance; mountBar(); watch(); connect(); },
  };

  // Screens that edit in place (groups, policies, CUEs, settings) are put back, so nothing looks saved that isn't.
  function watch() {
    var keys = ['roles', 'policies', 'cues', 'rates', 'caps', 'capModes'];
    var saved = {};
    keys.forEach(function (k) { saved[k] = JSON.stringify(comp.state[k] === undefined ? null : comp.state[k]); });
    setInterval(function () {
      var patch = null;
      keys.forEach(function (k) { var now = JSON.stringify(comp.state[k] === undefined ? null : comp.state[k]); if (now !== saved[k]) { patch = patch || {}; patch[k] = JSON.parse(saved[k]); } });
      if (patch) { comp.setState(patch); toast(READONLY); }
    }, 500);
  }

  // Fleet live events (Fleet sign-ins only; the server relays the stream with the user's token).
  function connect() {
    if (!U.fleet) return;
    try {
      var es = new EventSource('/api/stream');
      es.onmessage = function (e) {
        try {
          var ev = JSON.parse(e.data);
          var label = { 'dlp.block': 'Blocked by DLP', 'dlp.warn': 'DLP warning', 'device.offline': 'Device offline', 'budget.exceeded': 'Budget cap reached' }[ev.type];
          if (label) toast('Fleet · ' + label + (ev.rule_id ? ' · ' + ev.rule_id : '') + (ev.device_id ? ' · ' + String(ev.device_id).slice(0, 8) : ''));
        } catch (x) {}
      };
    } catch (x) {}
  }

  // ---------- status bar ----------
  function mountBar() {
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;background:#0B1220;color:#fff;border-radius:10px;padding:9px 12px;font:12px/1.4 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(92vw,620px)';
    var dot = L.reachable ? '#3fbf7f' : '#e5484d';
    var info = document.createElement('span');
    info.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + dot + ';margin-right:6px"></span>' +
      (L.reachable ? 'Live · Fleet' : 'Fleet not reachable') + ' · fetched ' + (S.CLOCK ? S.CLOCK.stampHm : '') + ' ' + (L.tz || '') + (U.fleet ? '' : ' · preview: public data only');
    info.style.opacity = '.9'; bar.appendChild(info);
    function btn(label, fn) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'border:0;border-radius:7px;padding:5px 10px;font:600 12px -apple-system,sans-serif;cursor:pointer;background:#2b3550;color:#fff'; b.onclick = fn; bar.appendChild(b); return b; }
    btn('Refresh', function () { fetch('/api/live/refresh', { method: 'POST' }).then(function () { location.reload(); }); });
    btn('Sign out', signOut);
    document.body.appendChild(bar);
  }
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:99999;background:#0B1220;color:#fff;padding:9px 14px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);transition:opacity .2s;max-width:90vw;pointer-events:none'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = '0'; }, 4200);
  }
})();
