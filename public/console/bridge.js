// Demo bridge: connects the RayShield console (a design prototype) to the demo server.
// It replays shared state on load, applies live events over SSE, enforces the signed-in
// user's permissions, and adds a small demo control bar. No product logic lives here.
(function () {
  'use strict';
  var U = window.__demoUser || { name: 'Priya Nair', role: 'Administrator', perms: { approveMcp: true, viewAll: true } };
  var comp = null;          // the RayShield root component instance
  var decided = new Set();  // MCP request ids this client has already applied
  var seen = new Set();     // event ids already applied (avoid double-apply on replay + live)

  function epIndexFor(detHost) {
    var m = window.__DEMO_EP || {};
    return m[detHost];
  }

  var LINEAR_ITEM = {
    id: 'm-linear', name: 'linear', source: 'github.com/linear/linear-mcp',
    desc: 'Reads and updates Linear issues the user token can access.',
    tools: [['list_issues', 0], ['get_issue', 0], ['update_issue', 1]],
    user: 'Dev Patel', role: 'engineering', host: 'LT-4821', tool: 'claude-code',
    age: 'just now', blocked: 1, reason: 'Triage my Linear issues from the CLI instead of the web app.',
    roleScope: 0, toolScope: 0, decision: null,
  };

  function targetsForLinear() {
    if (!comp) return [];
    return comp.state.cues.filter(function (c) { return c.role === 'engineering' && c.tool === 'claude-code' && c.state !== 'retired'; });
  }

  function addLinearRequest() {
    if (!comp) return;
    if (comp.state.mcp.some(function (m) { return m.id === 'm-linear'; })) return;
    comp.setState(function (s) { return { mcp: [Object.assign({}, LINEAR_ITEM), ...s.mcp] }; });
  }

  function applyDetection(evt) {
    if (!comp) return;
    var idx = epIndexFor(evt.detHost);
    if (idx == null) return;
    var row = [evt.id.slice(0, 12), evt.id.slice(0, 12), idx, evt.rawTs, evt.ruleIndex, evt.disposition, evt.extra || null];
    comp.setState(function (s) {
      var cur = s.demoDet || [];
      if (cur.some(function (r) { return r[0] === row[0]; })) return {};
      return { demoDet: [...cur, row] };
    });
  }

  function applyMcpDecision(evt) {
    if (!comp) return;
    if (decided.has(evt.id)) return;              // this client already applied it locally
    decided.add(evt.id);
    var item = comp.state.mcp.find(function (m) { return m.id === evt.id; }) || Object.assign({}, LINEAR_ITEM);
    if (evt.decision === 'approved') {
      if (comp.approveMcp) comp.approveMcp(item, targetsForLinear(), true);
    } else if (comp.denyMcp) {
      comp.denyMcp(item, true);
    }
  }

  function apply(evt) {
    if (!evt || (evt.id && seen.has(evt.id))) return;
    if (evt.id) seen.add(evt.id);
    switch (evt.type) {
      case 'reset': location.reload(); break;
      case 'mcpRequest': addLinearRequest(); toast('Dev Patel requested the linear MCP server'); break;
      case 'mcpDecision': applyMcpDecision(evt); break;
      case 'detection': applyDetection(evt); if (U.perms.viewAll) toast((evt.severity === 'critical' ? '🔴 ' : '🟠 ') + 'New detection on ' + evt.detHost); break;
      case 'cuePushed': /* console shows the new CUE version via approveMcp; nothing extra */ break;
      default: break;
    }
  }

  // Public surface used by the patched approveMcp/denyMcp in the prototype.
  window.__demoBridge = {
    attach: function (instance) {
      comp = instance;
      hydrate();
      connect();
      mountBar();
    },
    canAct: function () {
      if (!U.perms.approveMcp) { toast('Your role (' + U.role + ') can view this, but cannot approve. Sign in as Priya or Tomas to act.'); return false; }
      return true;
    },
    post: function (msg) {
      if (msg.type === 'mcpDecision') {
        decided.add(msg.id); // we applied locally already
        fetch('/api/mcp/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: msg.decision }) }).catch(function () {});
      }
    },
  };

  function hydrate() {
    fetch('/api/state').then(function (r) { return r.json(); }).then(function (st) {
      (st.events || []).forEach(apply);
    }).catch(function () {});
  }

  function connect() {
    try {
      var es = new EventSource('/api/stream');
      es.onmessage = function (e) { try { apply(JSON.parse(e.data)); } catch (x) {} };
      es.onerror = function () { /* browser auto-retries */ };
    } catch (x) {}
  }

  // --- demo control bar --------------------------------------------------------
  function mountBar() {
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;background:#0B1220;color:#fff;border-radius:10px;padding:10px 12px;font:12px/1.4 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center;max-width:min(92vw,560px)';
    var who = document.createElement('span');
    who.style.cssText = 'opacity:.85;margin-right:2px';
    who.textContent = U.name + ' · ' + (U.title || U.role);
    bar.appendChild(who);

    function btn(label, fn, bg) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'border:0;border-radius:7px;padding:6px 10px;font:600 12px -apple-system,sans-serif;cursor:pointer;background:' + (bg || '#2b3550') + ';color:#fff';
      b.onclick = fn; bar.appendChild(b); return b;
    }
    if (U.perms.approveMcp) {
      btn('Approve Linear MCP', function () {
        fetch('/api/mcp/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approved' }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.error) toast(j.error); else toast('Approved — signed CUE pushed to Dev Patel'); });
      }, '#3a7d57');
    }
    if (U.perms.viewAll) btn('Reset demo', function () { if (confirm('Reset the demo tenant to its starting state?')) fetch('/api/reset', { method: 'POST' }); }, '#6b3b3b');
    btn('Switch user', function () { location.href = '/login'; }, '#2b3550');
    document.body.appendChild(bar);
  }

  var toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:99999;background:#0B1220;color:#fff;padding:9px 14px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);transition:opacity .2s;max-width:90vw';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = '0'; }, 3400);
  }
})();
