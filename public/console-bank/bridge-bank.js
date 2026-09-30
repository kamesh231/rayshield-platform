// Demo bridge for the Straits Meridian Bank console (fictional tenant).
// - Supplies persona-specific Home / overview values to hooks patched in by scripts/apply-tenant.mjs
//   (window.__rsHome, __rsOverview, __rsEnrich), computed live from the seeded constants, so tiles,
//   lists and drill-downs always reconcile.
// - Sends every write to the server (roles are enforced there) and applies the resulting SSE events,
//   so all open consoles, the terminal and /me stay in step.
// - Adds the demo control bar. No product logic lives here.
(function () {
  'use strict';
  var U = window.__demoUser || { name: 'Tan Wei Ling', role: 'Administrator', perms: {}, holders: {}, demoBar: [] };
  var S = window.__S || {};
  var comp = null, seen = new Set(), replaying = false;
  var INK = '#0B1220', WARN = '#B4530A', CRIT = '#C4293A', TEAL = '#4F5BD5', GREEN = '#157F4E', MUTED = '#5b6773', GOLD = '#8a6d1f';
  var TITLE = { approved: 'Approved', unapproved: 'Unapproved', prohibited: 'Prohibited', under_review: 'Under review', beta: 'Beta', unlabelled: 'Unlabelled' };
  var TOAPI = { Approved: 'approved', Unapproved: 'unapproved', Prohibited: 'prohibited', 'Under review': 'under_review', Beta: 'beta' };
  var ACTION = { setStatus: 'set governance status', decideMcp: 'approve or block MCP servers', onboardMcp: 'onboard MCP servers', assignPolicy: 'change group MCP policy', editCue: 'edit CUEs', publishCue: 'publish CUEs', deleteCue: 'retire or delete CUEs', createGroup: 'create groups', settingsWrite: 'change settings', reset: 'reset the demo' };
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n)); }
  function go(page, extra) { return function () { comp.go(page, extra); window.scrollTo(0, 0); }; }
  function svcById(id) { return (S.SERVICES || []).find(function (s) { return s.service_id === id; }); }
  function openSvc(id) { return function () { var s = svcById(id); if (s) comp.setState({ page: 'services', statusFilter: 'all', panel: { type: 'service', id: s.id } }); }; }
  function signOut() { fetch('/api/logout', { method: 'POST' }).then(function () { location.href = '/login'; }); }
  function row(label, sub, value, color, def, g) { return { label: label, sub: sub, value: String(value), valueColor: color || INK, def: def || label, go: g || function () {} }; }
  function att(kind, color, text, meta, g) { return { kind: kind, color: color, text: text, meta: meta || '', go: g || function () {} }; }

  // ---------- live facts computed from the seeded constants + component state ----------
  function facts() {
    var st = comp.state, svcs = S.SERVICES || [], F = S.FLEET || [];
    var status = function (s) { return comp.svcStatus(s); };
    var unl = svcs.filter(function (s) { return status(s) === 'Unlabelled'; });
    var shadowReq = svcs.filter(function (s) { return ['Unapproved', 'Prohibited', 'Unlabelled'].indexOf(status(s)) >= 0; }).reduce(function (a, s) { return a + s.daily; }, 0);
    var totalReq = svcs.reduce(function (a, s) { return a + s.daily; }, 0);
    var rows = (S.DET_ROWS || []).concat(st.demoDet || []);
    var rule = function (r) { return S.DET_RULES[r[4]]; };
    var crit = rows.filter(function (r) { return rule(r)[2] === 'critical'; });
    var behindBy = {}; F.forEach(function (e) { if (e.behind && !e.noAgent) behindBy[e.role] = (behindBy[e.role] || 0) + 1; });
    var pending = (st.bridge || []).filter(function (b) { return b.status === 'Awaiting approval' || b.status === 'Scanning'; });
    var draft = (st.cues || []).find(function (c) { return c.state === 'draft'; });
    var pay = (st.cues || []).find(function (c) { return c.id === 'cue_payments_v3'; });
    var R = S.RADIUS || [];
    return {
      svcs: svcs, total: svcs.length, unl: unl, governed: svcs.length - unl.length, shadowPct: totalReq ? shadowReq / totalReq * 100 : 0,
      prohibited: svcs.filter(function (s) { return status(s) === 'Prohibited'; }),
      fleet: F.length, enforcing: F.filter(function (e) { return !e.noAgent && !e.recordOnly && !e.offline; }).length,
      offline: F.filter(function (e) { return e.offline; }).length, recordOnly: F.filter(function (e) { return e.recordOnly; }).length, noAgent: F.filter(function (e) { return e.noAgent; }).length,
      laptops: F.filter(function (e) { return e.type === 'laptop'; }).length, vms: F.filter(function (e) { return e.type === 'VM'; }).length, others: F.filter(function (e) { return e.type === 'other'; }).length,
      behindBy: behindBy, detections: rows.length, crit: crit.length, contained: crit.filter(function (r) { return r[5] !== 'r'; }).length,
      escalated: rows.filter(function (r) { return r[5] === 'e'; }).length,
      cardNricLeft: rows.filter(function (r) { return ['CARD-PAN', 'PII-NRIC'].indexOf(rule(r)[0]) >= 0 && r[5] === 'r'; }).length,
      pending: pending, draft: draft, pay: pay, onboarded: (st.bridge || []).filter(function (b) { return b.status === 'Onboarded'; }).length,
      confluence: (st.bridge || []).find(function (b) { return b.name === 'confluence'; }),
      runs: R.reduce(function (a, r) { return a + r.total; }, 0), runUsers: new Set(R.map(function (r) { return r.user; })).size,
      notOnboarded: (S.MCP_DISC || []).filter(function (m) { return m.kind === 'MCP' && !(st.bridge || []).some(function (b) { return b.name === m.name && b.status === 'Onboarded'; }); }),
      live: st.demoDet || [],
    };
  }
  function driftLine(f) { var n = S.ROLE_NAMES || {}; return Object.keys(f.behindBy).map(function (k) { return (n[k] || k).replace('Engineering — ', '').replace(' & Analytics', '') + ' ' + f.behindBy[k]; }).join(' · '); }
  function ciSOdecisions(f) {
    var out = [];
    if (f.confluence && f.confluence.status !== 'Onboarded' && f.confluence.status !== 'Rejected') out.push(att('DECISION', CRIT, 'Approve or block confluence MCP for Engineering — Payments (requested by Rahul Iyer)', 'MCP Bridge', go('bridge')));
    if (f.draft) out.push(att('DECISION', CRIT, 'Publish Payments CUE v' + f.draft.v + ' (dlp-mask-query-results) drafted by ' + f.draft.by, 'CUE draft', go('cue', { cueSel: f.draft.id, retireOpen: false })));
    if (f.unl.length) out.push(att('DECISION', WARN, 'Decide on ' + f.unl.slice(0, 2).map(function (s) { return s.name; }).join(' and ') + (f.unl.length > 2 ? ' +' + (f.unl.length - 2) : '') + ' (new, unlabelled)', 'Discover', go('services', { statusFilter: 'Unlabelled' })));
    return out;
  }

  // ---------- Home per persona ----------
  window.__rsHome = function (c, page, role, x) {
    comp = comp || c;
    var f = facts(), key = S.HOME_KEY || 'admin', staleN = x.staleN || 0, planes, attn;
    var liveAttn = f.live.map(function (r) { return att('PROTECT', CRIT, 'Card data blocked again on ' + (S.DET_EPS[r[2]] || [])[0] + ' · just now (live)', 'CARD-PAN · blocked', go('detection', { dxId: r[0], dxFam: 'CARD-PAN' })); });
    if (key === 'ciso') {
      var dec = ciSOdecisions(f);
      planes = [
        { name: 'Governance', verb: 'discover', linkLabel: 'Open AI services', go: go('services', { statusFilter: 'all' }), rows: [
          row('Services governed', 'status set by a named reviewer', f.governed + ' of ' + f.total, INK, 'Services with a status other than Unlabelled', go('services', { statusFilter: 'Unlabelled' })),
          row('Shadow share', '5.4 % in the previous 7 days', f.shadowPct.toFixed(1) + '%', f.shadowPct < 5.4 ? GREEN : WARN, 'Requests to Unapproved, Prohibited or Unlabelled services ÷ all requests', go('services', { statusFilter: 'shadow' })),
          row('Prohibited services blocked', f.prohibited.map(function (s) { return s.name; }).join(' · '), f.prohibited.length, INK, 'Services labelled Prohibited (data residency)', go('services', { statusFilter: 'Prohibited' })) ] },
        { name: 'Protection', verb: 'protect', linkLabel: 'Open detections', go: go('detections'), rows: [
          row('Endpoints enforcing', f.enforcing + ' of ' + f.fleet + ' endpoints', Math.round(f.enforcing / f.fleet * 100) + '%', INK, 'Endpoints with an enforcing Aegis agent', go('fleet', { fleetFilter: 'all' })),
          row('Critical detections contained', 'blocked or escalated · last 7d', f.contained + ' / ' + f.crit, f.contained === f.crit ? GREEN : CRIT, 'Critical detections that were blocked or escalated (none only recorded)', go('detections')),
          row('Card or NRIC records that left the bank', 'every card-data and NRIC event blocked before transmission', f.cardNricLeft, f.cardNricLeft ? CRIT : GREEN, 'CARD-PAN and PII-NRIC detections that were only recorded', go('detlist', { dxFam: 'CARD-PAN', dxSev: 'all', dxDisp: 'all', dxQ: '' })) ] },
        { name: 'Decisions', verb: 'for the CISO', linkLabel: 'Open MCP Bridge', go: go('bridge'), rows: [
          row('Decisions awaiting you', 'MCP approval · CUE publish · governance', dec.length, dec.length ? WARN : INK, 'High-risk calls reserved for Admin or CISO', go('bridge')),
          row('Frameworks tracked', 'framework level · mapping to be confirmed', (S.TEXT.frameworks || []).length, INK, 'MAS TRM, MAS Notice on Cyber Hygiene, PDPA, PCI DSS v4.0', go('home')),
          row('MCP servers onboarded', 'sandboxed · signed · selectable in CUEs', f.onboarded, INK, 'Approved through the MCP Bridge', go('bridge')) ] },
      ];
      attn = liveAttn.concat(dec, (S.TEXT.frameworks || []).map(function (fw) { return att('FRAMEWORK', GOLD, fw + ' — evidence: signed CUEs, DLP detections, MCP Bridge approvals', 'mapping to be confirmed', go('home')); }));
    } else if (key === 'security') {
      planes = [
        { name: 'Protect', verb: 'enforced', linkLabel: 'Open detections', go: go('detections'), rows: [
          row('Detections', 'rule-tagged findings · last 7d', f.detections, CRIT, 'Deterministic engine detections', go('detections')),
          row('Escalated to a human', 'card data · NRIC · source archive', f.escalated, WARN, 'Detections escalated to the SOC', go('detections')),
          row('Critical severity', 'all blocked or escalated', f.crit, CRIT, 'CARD-PAN, PII-NRIC, EXFIL', go('detections')) ] },
        { name: 'Discover', verb: 'observed', linkLabel: 'Open AI services', go: go('services', { statusFilter: 'shadow' }), rows: [
          row('Prohibited service in use', 'DeepSeek on 6 Treasury endpoints', f.prohibited.length, CRIT, 'Services labelled Prohibited with activity', openSvc('deepseek')),
          row('Awaiting a governance decision', f.unl.map(function (s) { return s.name; }).join(' · ') || 'none', f.unl.length, f.unl.length ? WARN : INK, 'Unlabelled services', go('services', { statusFilter: 'Unlabelled' })),
          row('MCP servers not onboarded', f.notOnboarded.map(function (m) { return m.name; }).join(' · '), f.notOnboarded.length, f.notOnboarded.length ? WARN : INK, 'MCP servers found on endpoints outside the MCP Bridge', go('mcp')) ] },
        { name: 'Control', verb: 'decided', linkLabel: 'Open MCP Bridge', go: go('bridge'), rows: [
          row('MCP servers awaiting approval', 'Admin or CISO approves · Security recommends', f.pending.length, f.pending.length ? WARN : INK, 'Scanned MCP servers waiting for a decision', go('bridge')),
          row('CUE drafts awaiting publish', f.draft ? 'Payments v' + f.draft.v + ' · dlp-mask-query-results' : 'none', f.draft ? 1 : 0, f.draft ? WARN : INK, 'Drafts need Admin or CISO to publish', f.draft ? go('cue', { cueSel: f.draft.id, retireOpen: false }) : go('cues')),
          row('Endpoints on an older CUE', driftLine(f), staleN, staleN ? WARN : INK, 'Endpoints not yet on the latest CUE version', go('fleet', { fleetFilter: 'behind' })) ] },
      ];
      attn = liveAttn.concat([
        att('PROTECT', CRIT, 'Card data blocked on LT-SG-2231 (Rahul Iyer) · escalated · det_01JA4K9PAN1', 'CARD-PAN · 2h ago', go('detection', { dxId: 'det_01JA4K9PAN1', dxFam: 'CARD-PAN' })),
        att('DISCOVER', CRIT, 'Activity on a prohibited service: DeepSeek on 6 Treasury endpoints', svcById('deepseek') ? fmt(svcById('deepseek').daily) + ' requests' : '', openSvc('deepseek')),
        comp.svcStatus(svcById('perplexity')) === 'Unlabelled' ? att('DISCOVER', WARN, 'Perplexity first seen today on 4 endpoints · no governance status yet', 'new', openSvc('perplexity')) : null,
        att('DISCOVER', WARN, 'Unonboarded MCP server gmail-mcp on LT-SG-5120 (Treasury) · risk high', 'MCP & Skills', go('mcp')),
        att('PROTECT', WARN, 'NRIC values via warehouse-mcp on LT-SG-4402 (Jia Hui Ong) · escalated', 'PII-NRIC', go('detlist', { dxFam: 'PII-NRIC', dxSev: 'all', dxDisp: 'all', dxQ: '' })),
        att('PROTECT', WARN, 'Source archive → paste.ee on LT-VN-0412 (contractor) · escalated', 'EXFIL', go('detlist', { dxFam: 'EXFIL', dxSev: 'all', dxDisp: 'all', dxQ: '' })),
      ]).filter(Boolean);
    } else {
      var conf = f.confluence, confPending = conf && conf.status !== 'Onboarded' && conf.status !== 'Rejected';
      planes = [
        { name: 'Discover', verb: 'observed', linkLabel: 'Open Discover overview', go: go('overview'), rows: [
          row('AI services detected', 'last 7d · pcap, sase_zscaler', f.total, INK, 'Distinct AI services with at least one request in 7 days', go('services', { statusFilter: 'all' })),
          row('Awaiting a governance decision', 'Unlabelled', f.unl.length, f.unl.length ? WARN : INK, 'Services with no status, reviewer or date', go('services', { statusFilter: 'Unlabelled' })),
          row('Endpoints observed', 'laptops ' + f.laptops + ' · VMs ' + f.vms + ' · others ' + f.others, f.fleet, INK, 'Distinct endpoints with at least one AI request', go('endpoints')) ] },
        { name: 'Control', verb: 'decided', linkLabel: 'Open MCP Bridge', go: go('bridge'), rows: [
          row('MCP onboarding queue', f.pending.map(function (b) { return b.name + ' · ' + b.status.toLowerCase(); }).join(' · ') || 'empty', f.pending.length, f.pending.length ? WARN : INK, 'Added → scanned → awaiting an Admin or CISO decision', go('bridge')),
          row('Endpoints on an older CUE', driftLine(f), staleN, staleN ? WARN : INK, 'Push queued or agent not yet updated', go('fleet', { fleetFilter: 'behind' })),
          row('Groups due for recertification', 'Vendor Engineering (contractors) · in 14 days', 1, WARN, 'Groups with a recertification date inside 30 days', go('roles')) ] },
        { name: 'Protect', verb: 'enforced', linkLabel: 'Open fleet', go: go('fleet'), rows: [
          row('Agents enforcing', f.recordOnly + ' record-only · ' + f.noAgent + ' no agent', f.enforcing + ' / ' + f.fleet, INK, 'Endpoints with an enforcing Aegis agent', go('fleet', { fleetFilter: 'all' })),
          row('Agents offline', 'no heartbeat for 10 min', f.offline, f.offline ? WARN : INK, 'Agents that stopped reporting', go('fleet', { fleetFilter: 'offline' })),
          row('Discovery sensors silent', 'sase_zscaler · 2 h 40 m', 1, CRIT, 'Sensors with no rows for 2 hours', go('settings', { setTab: 'sensors' })) ] },
      ];
      attn = liveAttn.concat([
        att('SYSTEM', CRIT, 'Sensor sase_zscaler (remote staff) has sent no data for 2 h 40 m', 'coverage partial', go('settings', { setTab: 'sensors' })),
        att('PROTECT', WARN, f.offline + ' agents offline for more than 10 minutes', 'fleet', go('fleet', { fleetFilter: 'offline' })),
        att('PROTECT', WARN, staleN + ' endpoints on an older CUE (' + driftLine(f) + ')' + (f.pay ? ' · Payments current is v' + f.pay.v : ''), 'CUE drift', go('fleet', { fleetFilter: 'behind' })),
        conf ? att('CONTROL', confPending ? WARN : GREEN, confPending ? 'confluence MCP awaiting a decision · requested by Rahul Iyer' : 'confluence MCP ' + conf.status.toLowerCase() + ' · ' + conf.by, 'MCP Bridge', go('bridge')) : null,
        att('CONTROL', WARN, 'Vendor Engineering (contractors) recertification due in 14 days', 'recertify', go('roles')),
        f.unl.length ? att('DISCOVER', WARN, f.unl.length + ' services unlabelled: ' + f.unl.map(function (s) { return s.name; }).join(', '), 'Discover', go('services', { statusFilter: 'Unlabelled' })) : null,
      ]).filter(Boolean);
    }
    return { signOut: signOut, planes: planes, homeAttention: attn, homeBannerN: String(f.runs), homeBannerTitle: 'DLP-blocked agent runs in the last 7 days — stopped before data left the sandbox', homeBannerSub: f.runUsers + ' users · ' + (S.RAD_STATS ? S.RAD_STATS.cues : 0) + ' CUEs · ' + (S.RAD_STATS ? S.RAD_STATS.sandboxes : 0) + ' MCP sandboxes · 0 records transmitted', radBadge: String(f.runs) };
  };

  // ---------- Discover overview ----------
  window.__rsOverview = function (c, L) {
    comp = comp || c;
    var T = S.TEXT || {}, pp = svcById('perplexity'), ds = svcById('deepseek'), cx = svcById('codex-cli');
    var open = function (s) { return s ? L.openService(s) : function () {}; };
    var attention = [
      pp && c.svcStatus(pp) === 'Unlabelled' ? att('OBSERVED', TEAL, 'New AI service detected: Perplexity · first seen today', pp.endpoints + ' endpoints · ' + fmt(pp.daily * L.scale) + ' requests', open(pp)) : null,
      ds ? att('GOVERNANCE', GOLD, 'Activity on a prohibited service: DeepSeek (Treasury)', ds.endpoints + ' endpoints · ' + fmt(ds.daily * L.scale) + ' requests', open(ds)) : null,
      L.unreviewed > 0 ? att('GOVERNANCE', GOLD, L.unreviewed + ' active services are unreviewed', L.reviewed + ' of ' + S.SERVICES.length + ' reviewed', go('services', { statusFilter: 'Unlabelled' })) : null,
      cx && c.svcStatus(cx) === 'Unlabelled' ? att('OBSERVED', TEAL, 'Codex CLI first seen on 7 contractor laptops · no status', fmt(cx.daily * L.scale) + ' requests', open(cx)) : null,
      att('SYSTEM', '#b42318', 'Sensor sase_zscaler has sent no data for 2 h 40 m', 'coverage partial', go('sensors')),
    ].filter(Boolean);
    var ratio = L.W.ep / (S.ENDPOINTS || []).length;
    var sensors = (T.sensors || []).map(function (x) { return { name: x.name, desc: x.desc, endpoints: Math.round(x.endpoints * ratio), services: Math.min(x.services, L.W.svc), servicesTip: 'AI services this sensor observed', requests: fmt(x.requests * L.scale), lastSeen: x.lastSeen, health: x.health, color: x.color }; });
    var R = S.RADIUS || [];
    return { attention: attention, sensors: sensors, freshness: T.freshness, decisions: (c.state.decisions || []).concat(T.decisions || []).slice(0, 4), svcTotal: String(S.SERVICES.length), dirProvider: (T.directory || {}).provider,
      platSbxRecords: (T.platformSandbox || {}).records, platSbxUnauth: (T.platformSandbox || {}).unauthorised, platSbxVms: (T.platformSandbox || {}).vms,
      radRootsLine: R.length + ' roots · ' + new Set(R.map(function (r) { return r.user; })).size + ' users · sorted by latest blocked run · open one to see its tree' };
  };

  // ---------- detection evidence (seeded; redacted for the CISO) ----------
  window.__rsEnrich = function (dd, x) {
    var ev = (S.DET_EVIDENCE || {})[x.id]; if (!ev) return;
    dd.ddDecode = false; dd.ddContent = false; dd.ddExfil = false; dd.ddEgress = false; dd.ddPersist = false; dd.ddUndisclosed = false;
    if (ev.redacted) { dd.teaser = ev.teaser + ' · evidence redacted for your role'; return; }
    if (ev.type === 'sensitive_content' && ev.content) { dd.ddContent = true; dd.content = ev.content; }
    if (ev.type === 'exfil' && ev.exfil) { dd.ddExfil = true; dd.exfil = ev.exfil; }
    if (ev.type === 'undisclosed_action' && ev.undis) { dd.ddUndisclosed = true; dd.undis = ev.undis; }
    dd.teaser = ev.teaser;
    if (ev.signature) dd.signature = ev.signature;
  };

  // ---------- server calls ----------
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { toast(j.error || ('Request failed (' + r.status + ')')); throw j; } return j; }); });
  }
  function holders(perm) { return ((U.holders || {})[perm] || []).join(' or ') || 'an administrator'; }
  function groupApiId(consoleId) { var g = (S.ROLES0 || []).find(function (r) { return r.id === consoleId; }); return g ? g.api_id : consoleId; }
  function bridgeIdOf(name) { var b = (comp.state.bridge || []).find(function (x) { return x.name === name; }); return b ? b.id : 'mcp_' + name; }

  window.__demoBridge = {
    bank: true,
    has: function (perm) { return !!(U.perms || {})[perm]; },
    can: function (perm) {
      if ((U.perms || {})[perm]) return true;
      toast('Only ' + holders(perm) + ' can ' + (ACTION[perm] || perm) + '. ' + U.name + ' (' + (U.roleLabel || U.role) + ') ' + (perm === 'decideMcp' ? 'can triage and recommend.' : 'has read access.'));
      return false;
    },
    canAct: function () { return this.can('decideMcp'); },
    onSetStatus: function (s, status) { if (!this.can('setStatus')) return false; api('PUT', '/api/discovery/services/' + encodeURIComponent(s.service_id) + '/status', { status: TOAPI[status] }).catch(function () {}); return false; },
    onApproveMcp: function (m) { if (!this.can('decideMcp')) return false; api('PATCH', '/api/control/mcp-bridge/' + (m.bridge_id || bridgeIdOf(m.name)), { status: 'approved', group_id: groupApiId(m.role) }).catch(function () {}); return false; },
    onDenyMcp: function (m) { if (!this.can('decideMcp')) return false; api('PATCH', '/api/control/mcp-bridge/' + (m.bridge_id || bridgeIdOf(m.name)), { status: 'blocked', approved_reason: 'Blocked from the approvals queue' }).catch(function () {}); return false; },
    onBridgeDecision: function (b, d) { if (!this.can('decideMcp')) return false; api('PATCH', '/api/control/mcp-bridge/' + b.id, d === 'approved' ? { status: 'approved', group_id: b.name === 'confluence' ? 'grp_payments_eng' : undefined } : { status: 'blocked' }).catch(function () {}); return false; },
    onAccessToggle: function (name, gcid, allow) {
      if (!this.can('assignPolicy')) return false;
      var acc = comp.state.access || {}; var names = Object.keys(acc).filter(function (n) { return n === name ? allow : !!(acc[n] || {})[gcid]; });
      api('PUT', '/api/control/groups/' + groupApiId(gcid) + '/mcp-policy', { allow: names }).catch(function () {}); return false;
    },
    onPublishGen: function (g) {
      if (!this.can('publishCue')) return false;
      var base = g && g.baseId && comp.state.cues.find(function (c) { return c.id === g.baseId; });
      if (base && (base.draftOf === 'cue_payments_v3' || base.id === 'cue_payments_v3')) { api('POST', '/api/control/cues/cue_payments_v3/publish').then(function () { comp.go('cue', { gen: null, cueSel: 'cue_payments_v3', retireOpen: false }); }).catch(function () {}); return false; }
      if (base) api('POST', '/api/control/cues/' + base.id + '/publish').catch(function () {});
      return true;
    },
    onOnboard: function (name, source) {
      if (!this.can('onboardMcp')) return false;
      if (!name) { toast('Give the MCP server a name.'); return false; }
      api('POST', '/api/control/mcp-bridge', { name: name, source: source || 'custom', kind: 'remote' }).then(function () { comp.setState({ obOpen: false, obName: '', obSource: '' }); }).catch(function () {});
      return false;
    },
    attach: function (instance) { comp = instance; hydrate(); connect(); mountBar(); setInterval(watch, 600); },
  };

  // ---------- events from the server ----------
  var trace = window.__rsEventTrace = [];   // last events applied, for presenters/debugging
  function apply(evt) {
    if (!evt) return;
    trace.push((evt.id && seen.has(evt.id) ? 'dup:' : '') + evt.type); if (trace.length > 50) trace.shift();
    if (evt.id && seen.has(evt.id)) return;
    if (evt.id) seen.add(evt.id);
    var me = evt.by === U.name;
    switch (evt.type) {
      case 'reset': if (!replaying) location.reload(); break;
      case 'serviceStatus': { var s = svcById(evt.serviceId); if (s) comp.setStatus(s, TITLE[evt.status], { by: evt.by }); if (!me) toast(evt.by + ' labelled ' + evt.name + ' ' + TITLE[evt.status]); break; }
      case 'mcpOnboarded': if (evt.name && !(S.MCP_CATALOG || []).some(function (m) { return m[0] === evt.name; })) S.MCP_CATALOG.push([evt.name, 'tools found at scan', null]); /* falls through */
      case 'mcpRequest': {
        comp.setState(function (st) {
          var exists = st.bridge.some(function (b) { return b.name === evt.name; });
          var bridge = exists ? st.bridge.map(function (b) { return b.name === evt.name && b.status !== 'Onboarded' && b.status !== 'Rejected' ? Object.assign({}, b, { status: 'Awaiting approval', date: 'requested just now', by: 'requested by ' + evt.by + (evt.host ? ' from ' + evt.host : '') + (evt.reason ? ' · “' + evt.reason + '”' : '') }) : b; })
            : st.bridge.concat([{ id: evt.bridgeId, name: evt.name, source: 'requested by ' + evt.by, scan: 'running · 2 of 5 checks', lvl: 'ok', tools: 'discovering tools…', status: 'Scanning', date: 'just now', by: 'requested by ' + evt.by }]);
          var mcp = st.mcp.map(function (m) { return m.name === evt.name && !m.decision ? Object.assign({}, m, { age: 'just now', reason: evt.reason || m.reason }) : m; });
          return { bridge: bridge, mcp: mcp };
        });
        if (!me && U.perms.viewAll) toast(evt.by + ' is asking for the ' + evt.name + ' MCP server — ' + (U.perms.decideMcp ? 'waiting on your decision' : holders('decideMcp') + ' decides'));
        break;
      }
      case 'mcpDecision': {
        var ok = evt.decision === 'approved';
        comp.setState(function (st) {
          var access = Object.assign({}, st.access);
          if (ok) { access[evt.name] = Object.assign({}, access[evt.name] || {}); if (evt.groupConsoleId) access[evt.name][evt.groupConsoleId] = 1; }
          return { access: access, bridge: st.bridge.map(function (b) { return b.name === evt.name ? Object.assign({}, b, { status: ok ? 'Onboarded' : 'Rejected', date: window.__TODAY, by: evt.by, scan: ok ? 'passed · approved' : b.scan }) : b; }) };
        });
        if (ok && !(S.MCP_CATALOG || []).some(function (m) { return m[0] === evt.name; })) S.MCP_CATALOG.push([evt.name, 'search · get_page', null]);
        var item = comp.state.mcp.find(function (m) { return m.name === evt.name && !m.decision; });
        if (item) { if (ok) comp.approveMcp(item, [], true); else comp.setState(function (st) { return { mcp: st.mcp.map(function (m) { return m.id === item.id ? Object.assign({}, m, { decision: 'denied' }) : m; }) }; }); }
        if (!replaying) toast(evt.name + ' ' + (ok ? 'approved' : 'blocked') + ' by ' + evt.by + (ok && evt.groupConsoleId ? ' for ' + (S.ROLE_NAMES[evt.groupConsoleId] || evt.groupConsoleId) : ''));
        break;
      }
      case 'mcpScanned': comp.setState(function (st) { return { bridge: st.bridge.map(function (b) { return b.id === evt.bridgeId || b.name === evt.name ? Object.assign({}, b, { status: b.status === 'Scanning' ? 'Awaiting approval' : b.status, scan: 'passed · ' + (evt.summary || '0 findings'), tools: evt.tools || b.tools, date: 'scanned ' + window.__TODAY }) : b; }) }; }); break;
      case 'sliceUpdated': if (evt.clientId !== CLIENT) { applySlice(evt.slice, evt.value); if (!replaying) toast(evt.by + ' saved a change to ' + LABEL[evt.slice]); } break;
      case 'accessChanged': comp.setState(function (st) { var a = Object.assign({}, st.access); Object.keys(a).forEach(function (n) { a[n] = Object.assign({}, a[n]); a[n][evt.groupConsoleId] = evt.allow.indexOf(n) >= 0 ? 1 : 0; }); return { access: a }; }); break;
      case 'cuePublished': {
        comp.setState(function (st) {
          var draft = st.cues.find(function (c) { return c.id === evt.draftId; }), cur = st.cues.find(function (c) { return c.id === evt.cueId; });
          if (!draft || !cur || cur.v >= evt.version) return {};
          var upd = Object.assign({}, cur, { v: evt.version, state: 'signed', pub: window.__TODAY, by: evt.by, env: draft.env.map(function (r) { return r.since === 'v' + evt.version ? Object.assign({}, r, { ref: evt.by + ' · published' }) : r; }),
            hist: [{ v: evt.version, date: window.__TODAY, by: evt.by, change: '+ DLP dlp-mask-query-results', via: 'published from draft' }].concat(cur.hist) });
          return { cues: st.cues.filter(function (c) { return c.id !== evt.draftId; }).map(function (c) { return c.id === evt.cueId ? upd : c; }), cueSel: st.cueSel === evt.draftId ? evt.cueId : st.cueSel, cuePub: { ids: [evt.cueId], prev: st.cues, refs: ['claude-code/payments-eng@v' + evt.version], via: 'publish' } };
        });
        rebaseLater('cues'); // server-driven change: adopt it as the saved value, don't re-send it
        if (!replaying) toast('Payments CUE v' + evt.version + ' published by ' + evt.by + ' · signed and pushed');
        break;
      }
      case 'cuePushed': if (evt.cueVersion) setTimeout(function () { comp.setState({ cuePub: null }); }, replaying ? 0 : 6000); break;
      case 'detection': {
        var idx = (S.DET_EPS || []).findIndex(function (e) { return e[0] === evt.detHost; });
        if (idx < 0 || !evt.rowId) break;
        (S.DET_EVIDENCE = S.DET_EVIDENCE || {})[evt.rowId] = S.REDACTED ? { type: 'sensitive_content', redacted: true, teaser: 'Card number (PAN) in agent context · MCP tool result → model prompt' } : evt.evidence;
        var r = (S.RADIUS || []).find(function (x) { return x.ep.indexOf(evt.detHost + ' ') === 0; });
        if (r && evt.run && !r.runs.some(function (x) { return x.id === evt.run.id; })) { r.runs.unshift(S.REDACTED ? Object.assign({}, evt.run, { action: '[redacted for your role]', dlpLong: 'Card PAN + NRIC · blocked (details redacted for your role)' }) : evt.run); r.total++; r.last = evt.run.when; }
        var rowArr = [evt.rowId, evt.sid, idx, evt.rawTs, evt.ruleIndex, evt.disposition];
        comp.setState(function (st) { var cur = st.demoDet || []; return cur.some(function (x) { return x[0] === rowArr[0]; }) ? {} : { demoDet: cur.concat([rowArr]), radTick: Date.now() }; });
        if (!replaying && U.perms.viewAll) toast('🔴 Card data blocked on ' + evt.detHost + ' — new critical detection');
        break;
      }
      default: break;
    }
  }
  function hydrate() {
    holdWatch(1500);
    fetch('/api/console/state').then(function (r) { return r.ok ? r.json() : { slices: {} }; }).catch(function () { return { slices: {} }; }).then(function (cs) {
      Object.keys(cs.slices || {}).forEach(function (k) { applySlice(k, cs.slices[k]); });
      return fetch('/api/state').then(function (r) { return r.json(); }).then(function (st) { replaying = true; try { (st.events || []).forEach(apply); } finally { replaying = false; } });
    }).catch(function () {}).then(function () { holdWatch(800); setTimeout(rebase, 500); });
  }

  // ---------- console edits saved by the server (survive sign-out and restarts) ----------
  // Each editable area is compared with the last saved value; a change is sent to the server, which
  // checks the role, writes data/tenants/straits-meridian/live-state.json and pushes it to other consoles.
  var CLIENT = Math.random().toString(36).slice(2);
  var LABEL = { roles: 'groups', policies: 'policies', cues: 'CUEs', settings: 'settings (rates and budgets)', fleetRoles: 'device groups' };
  var SLICE = {
    roles: function (st) { return st.roles; },
    policies: function (st) { return st.policies; },
    cues: function (st) { return st.cues; },
    settings: function (st) { return { rates: st.rates || null, caps: st.caps || null, capModes: st.capModes || null }; },
    fleetRoles: function () { var m = {}; (S.FLEET || []).forEach(function (e) { m[e.devId] = e.role || null; }); return m; },
  };
  var saved = {}, savedJson = {}, holdUntil = 0, inflight = {}, pending = {};
  function rebaseLater(k) { pending[k] = true; setTimeout(function () { pending[k] = false; if (!inflight[k]) { saved[k] = JSON.parse(JSON.stringify(current(k))); savedJson[k] = JSON.stringify(saved[k]); } }, 250); }
  function holdWatch(ms) { holdUntil = Math.max(holdUntil, Date.now() + (ms || 350)); }
  function current(k) { return SLICE[k](comp.state); }
  function rebase() { Object.keys(SLICE).forEach(function (k) { if (!inflight[k]) { saved[k] = JSON.parse(JSON.stringify(current(k))); savedJson[k] = JSON.stringify(saved[k]); } }); }
  function applySlice(k, v) {
    if (!SLICE[k] || v == null) return;
    holdWatch();
    if (k === 'settings') comp.setState({ rates: v.rates || null, caps: v.caps || null, capModes: v.capModes || null });
    else if (k === 'fleetRoles') { (S.FLEET || []).forEach(function (e) { if (Object.prototype.hasOwnProperty.call(v, e.devId)) e.role = v[e.devId]; }); comp.setState({ devTick: Date.now() }); }
    else { var patch = {}; patch[k] = v; comp.setState(patch); }
    saved[k] = JSON.parse(JSON.stringify(v)); savedJson[k] = JSON.stringify(v);
  }
  function opFor(k, prev, cur) {
    if (k === 'roles') return cur.some(function (r) { return !prev.some(function (x) { return x.id === r.id; }); }) ? 'createGroup' : 'editGroup';
    if (k === 'cues') return cur.some(function (c) { var o = prev.find(function (x) { return x.id === c.id; }); return c.state === 'retired' && (!o || o.state !== 'retired'); }) ? 'retire' : 'publish';
    return 'edit';
  }
  function watch() {
    if (!comp || Date.now() < holdUntil) return;
    Object.keys(SLICE).forEach(function (k) {
      if (inflight[k] || pending[k]) return;
      var cur = current(k), json = JSON.stringify(cur);
      if (savedJson[k] === undefined) { saved[k] = JSON.parse(json); savedJson[k] = json; return; }
      if (json === savedJson[k]) return;
      var prev = saved[k]; inflight[k] = true;
      fetch('/api/console/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slice: k, op: opFor(k, prev || [], cur), value: cur, clientId: CLIENT }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (res) {
          inflight[k] = false;
          if (res.ok) { saved[k] = JSON.parse(json); savedJson[k] = json; }
          else { var op = opFor(k, prev || [], cur), need = { roles: op === 'createGroup' ? 'createGroup' : 'assignPolicy', policies: 'editCue', cues: op === 'retire' ? 'deleteCue' : 'publishCue', settings: 'settingsWrite', fleetRoles: 'assignPolicy' }[k];
            toast(res.status === 403 || /FORBIDDEN/.test(res.j.code || '') ? 'Only ' + holders(need) + ' can change ' + LABEL[k] + '. Your change was not saved.' : (res.j.error || 'Change not saved.')); applySlice(k, prev); }
        }).catch(function () { inflight[k] = false; });
    });
  }
  function connect() { try { var es = new EventSource('/api/stream'); es.onmessage = function (e) { try { apply(JSON.parse(e.data)); } catch (x) { console.error('[bank bridge] event failed', x); } }; } catch (x) {} }

  // ---------- demo control bar ----------
  function mountBar() {
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;background:#0B1220;color:#fff;border-radius:10px;padding:10px 12px;font:12px/1.4 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(92vw,640px)';
    var who = document.createElement('span'); who.style.cssText = 'opacity:.85;margin-right:2px'; who.textContent = U.name + ' · ' + (U.title || U.role); bar.appendChild(who);
    function btn(label, fn, bg) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'border:0;border-radius:7px;padding:6px 10px;font:600 12px -apple-system,sans-serif;cursor:pointer;background:' + (bg || '#2b3550') + ';color:#fff'; b.onclick = fn; bar.appendChild(b); return b; }
    (U.demoBar || []).forEach(function (k) {
      if (k === 'approve-confluence') btn('Approve confluence MCP', function () { api('PATCH', '/api/control/mcp-bridge/mcp_confluence', { status: 'approved', group_id: 'grp_payments_eng', approved_reason: 'Read-only runbooks for settlement debugging · Engineering — Payments' }).catch(function () {}); }, '#3a7d57');
      if (k === 'publish-cue-v4') btn('Publish Payments CUE v4', function () { api('POST', '/api/control/cues/cue_payments_v3/publish').catch(function () {}); }, '#3a5a9d');
      if (k === 'reset') btn('Reset demo', function () { if (confirm('Reset the Straits Meridian demo to its starting state?')) api('POST', '/api/demo/reset').catch(function () {}); }, '#6b3b3b');
    });
    btn('Sign out', signOut, '#2b3550');
    document.body.appendChild(bar);
  }
  var toastEl = null, toastT = null;
  function toast(msg) {
    if (replaying) return;
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:99999;background:#0B1220;color:#fff;padding:9px 14px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);transition:opacity .2s;max-width:90vw'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = '0'; }, 4200);
  }
})();
