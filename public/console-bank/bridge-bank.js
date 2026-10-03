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
  var ACTION = { setStatus: 'set governance status', decideMcp: 'approve or block MCP servers', onboardMcp: 'onboard MCP servers', assignPolicy: 'change group MCP policy', editCue: 'edit CUEs', publishCue: 'publish CUEs', deleteCue: 'retire or delete CUEs', createGroup: 'create groups', settingsWrite: 'change settings', reset: 'reset the demo', removeMcp: 'deboard MCP servers' };
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
  // Decisions come from the inbox: each pending approval the signed-in person can decide, newest first.
  function approvalRows() {
    return ((INBOX.data || {}).needs_decision || []).map(function (w) {
      var rec = (w.recommendations || []).map(function (r) { return r.by.split(' ')[0] + ' recommends ' + (r.recommendation === 'block' ? 'blocking' : 'approval'); }).join(' · ');
      return att('DECISION', CRIT, w.summary + (w.kind === 'mcp_access' || w.kind === 'cue_publish' ? ' — ' + w.title : ''), 'inbox · ' + ago(w.requested_at) + (rec ? ' · ' + rec : ''), function () { openInbox(w.id); });
    });
  }
  function ciSOdecisions(f) {
    var out = approvalRows();
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
      attn = liveAttn.concat(dec, myRequestRows(), (S.TEXT.frameworks || []).map(function (fw) { return att('FRAMEWORK', GOLD, fw + ' — evidence: signed CUEs, DLP detections, MCP Bridge approvals', 'mapping to be confirmed', go('home')); }));
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
          row('CUE drafts awaiting publish', f.draft ? 'Payments v' + f.draft.v + ' · ' + (myOpen('cue_publish') ? 'submitted · waiting for Admin or CISO' : 'not submitted yet') : 'none', f.draft ? 1 : 0, f.draft ? WARN : INK, 'Drafts need Admin or CISO to publish', f.draft ? go('cue', { cueSel: f.draft.id, retireOpen: false }) : go('cues')),
          row('Endpoints on an older CUE', driftLine(f), staleN, staleN ? WARN : INK, 'Endpoints not yet on the latest CUE version', go('fleet', { fleetFilter: 'behind' })) ] },
      ];
      attn = liveAttn.concat(myRequestRows(), [
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
      attn = liveAttn.concat(approvalRows(), [
        att('SYSTEM', CRIT, 'Sensor sase_zscaler (remote staff) has sent no data for 2 h 40 m', 'coverage partial', go('settings', { setTab: 'sensors' })),
        att('PROTECT', WARN, f.offline + ' agents offline for more than 10 minutes', 'fleet', go('fleet', { fleetFilter: 'offline' })),
        att('PROTECT', WARN, staleN + ' endpoints on an older CUE (' + driftLine(f) + ')' + (f.pay ? ' · Payments current is v' + f.pay.v : ''), 'CUE drift', go('fleet', { fleetFilter: 'behind' })),
        conf ? att('CONTROL', confPending ? WARN : GREEN, confPending ? 'confluence MCP awaiting a decision · requested by Rahul Iyer' : 'confluence MCP ' + conf.status.toLowerCase() + ' · ' + conf.by, 'MCP Bridge', go('bridge')) : null,
        att('CONTROL', WARN, 'Vendor Engineering (contractors) recertification due in 14 days', 'recertify', go('roles')),
        f.unl.length ? att('DISCOVER', WARN, f.unl.length + ' services unlabelled: ' + f.unl.map(function (s) { return s.name; }).join(', '), 'Discover', go('services', { statusFilter: 'Unlabelled' })) : null,
      ]).filter(Boolean);
    }
    var ib = inboxCount();
    return { signOut: signOut, openInbox: function () { openInbox(); }, inboxBadge: ib ? String(ib) : '', inboxBg: INBOX.open ? '#ECEEFF' : 'transparent', inboxColor: INBOX.open ? '#4F5BD5' : '#5b6773',
      planes: planes, homeAttention: attn, homeBannerN: String(f.runs), homeBannerTitle: 'DLP-blocked agent runs in the last 7 days — stopped before data left the sandbox', homeBannerSub: f.runUsers + ' users · ' + (S.RAD_STATS ? S.RAD_STATS.cues : 0) + ' CUEs · ' + (S.RAD_STATS ? S.RAD_STATS.sandboxes : 0) + ' MCP sandboxes · 0 records transmitted', radBadge: String(f.runs) };
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
  function groupLabel(apiId) { var g = (S.ROLES0 || []).find(function (r) { return r.api_id === apiId || r.id === apiId; }); return g ? g.name : (S.ROLE_NAMES || {})[apiId] || apiId; }
  function groupApiId(consoleId) { var g = (S.ROLES0 || []).find(function (r) { return r.id === consoleId; }); return g ? g.api_id : consoleId; }
  function bridgeIdOf(name) { var b = (comp.state.bridge || []).find(function (x) { return x.name === name; }); return b ? b.id : 'mcp_' + name; }

  window.__demoBridge = {
    bank: true,
    has: function (perm) { return !!(U.perms || {})[perm]; },
    can: function (perm) {
      if ((U.perms || {})[perm]) return true;
      toast('Only ' + holders(perm) + ' can ' + (ACTION[perm] || perm) + '. ' + U.name + ' (' + (U.roleLabel || U.role) + ') ' + (perm === 'decideMcp' ? 'can recommend from the inbox.' : 'has read access.'));
      return false;
    },
    canAct: function () { return true; },
    onSetStatus: function (s, status) { if (!this.can('setStatus')) return false; api('PUT', '/api/discovery/services/' + encodeURIComponent(s.service_id) + '/status', { status: TOAPI[status] }).catch(function () {}); return false; },
    // MCP decisions. Admin and CISO choose the group and how long access lasts; Security recommends instead.
    onApproveMcp: function (m) {
      var bid = m.bridge_id || bridgeIdOf(m.name);
      if (!this.has('decideMcp')) { recommendMcp(bid, m.name, 'approve'); return false; }
      grantDialog({ bridgeId: bid, name: m.name, groupId: groupApiId(m.role), reason: m.reason, who: m.user }); return false;
    },
    onDenyMcp: function (m) {
      var bid = m.bridge_id || bridgeIdOf(m.name);
      if (!this.has('decideMcp')) { recommendMcp(bid, m.name, 'block'); return false; }
      api('PATCH', '/api/control/mcp-bridge/' + bid, { status: 'blocked', approved_reason: 'Blocked from the approvals queue' }).catch(function () {}); return false;
    },
    onBridgeDecision: function (b, d) {
      if (!this.has('decideMcp')) { recommendMcp(b.id, b.name, d === 'approved' ? 'approve' : 'block'); return false; }
      if (d === 'approved') grantDialog({ bridgeId: b.id, name: b.name, groupId: b.name === 'confluence' ? 'grp_payments_eng' : '' });
      else api('PATCH', '/api/control/mcp-bridge/' + b.id, { status: 'blocked' }).catch(function () {});
      return false;
    },
    onSuspendMcp: function (b) {
      var reinstate = b.status === 'Suspended';
      if (!this.has('decideMcp')) { if (reinstate) { toast('Only ' + holders('decideMcp') + ' can reinstate an MCP server.'); return false; } askApproval({ kind: 'mcp_remove', action: 'suspend', bridge_id: b.id, name: b.name }, 'Suspend ' + b.name, ['− ' + b.name + ' blocked for every group until reinstated', '= group policies are kept, so Reinstate restores access'], 'decideMcp'); return false; }
      if (reinstate) { api('PATCH', '/api/control/mcp-bridge/' + b.id, { status: 'approved' }).catch(function () {}); return false; }
      confirmDialog('Suspend ' + b.name, ['− blocked for every group and every running session, at once', '= group policies are kept, so Reinstate restores access'], 'Suspend', function (note) { return api('PATCH', '/api/control/mcp-bridge/' + b.id, { status: 'blocked', suspend: true, approved_reason: note || undefined }); });
      return false;
    },
    onDeboardMcp: function (b) {
      if (!this.has('removeMcp')) { askApproval({ kind: 'mcp_remove', action: 'remove', bridge_id: b.id, name: b.name }, 'Deboard ' + b.name, ['− ' + b.name + ' removed from the MCP Bridge', '− access removed from every group that allows it'], 'removeMcp'); return false; }
      confirmDialog('Deboard ' + b.name, ['− removed from the MCP Bridge', '− access removed from every group that allows it · running sessions lose it at once', 'To use it again it must be onboarded and scanned again'], 'Deboard', function () { return api('DELETE', '/api/control/mcp-bridge/' + b.id); });
      return false;
    },
    onAccessToggle: function (name, gcid, allow) {
      var gid = groupApiId(gcid), acc = comp.state.access || {};
      var names = Object.keys(acc).filter(function (n) { return n === name ? allow : !!(acc[n] || {})[gcid]; });
      if (!this.has('assignPolicy')) { askApproval({ kind: 'group_policy', group_id: gid, allow: names }, (allow ? 'Allow ' : 'Remove ') + name + (allow ? ' for ' : ' from ') + groupLabel(gid), [(allow ? '+ ' : '− ') + name + (allow ? ' allowed' : ' no longer allowed') + ' · ' + groupLabel(gid)], 'assignPolicy'); return false; }
      if (allow) { grantDialog({ name: name, groupId: gid, policyAllow: names }); return false; }
      api('PUT', '/api/control/groups/' + gid + '/mcp-policy', { allow: names }).catch(function () {}); return false; // removing access never waits
    },
    onPublishGen: function (g) {
      var base = g && g.baseId && comp.state.cues.find(function (c) { return c.id === g.baseId; });
      var isPay = base && (base.draftOf === 'cue_payments_v3' || base.id === 'cue_payments_v3' || base.id === 'cue_payments_v4_draft');
      if (!this.has('publishCue')) {
        if (!this.has('draftCue')) return this.can('publishCue');
        if (isPay) { comp.go('cue', { gen: null, cueSel: 'cue_payments_v4_draft', retireOpen: false }); askApproval({ kind: 'cue_publish', cue_id: 'cue_payments_v3' }, 'Publish Payments CUE v4', ['+ DLP dlp-mask-query-results · Enforce', '= inherited rows from Bank baseline stay locked', '→ signed as claude-code/payments-eng@v4'], 'publishCue'); return false; }
        return true; // other CUEs: the change is caught by the save watcher and sent for approval
      }
      if (isPay) { api('POST', '/api/control/cues/cue_payments_v3/publish').then(function () { comp.go('cue', { gen: null, cueSel: 'cue_payments_v3', retireOpen: false }); }).catch(function () {}); return false; }
      if (base) api('POST', '/api/control/cues/' + base.id + '/publish').catch(function () {});
      return true;
    },
    onOnboard: function (name, source) {
      if (!name) { toast('Give the MCP server a name.'); return false; }
      if (!this.has('onboardMcp')) { askApproval({ kind: 'mcp_onboard', name: name, source: source || 'custom' }, 'Onboard ' + name, ['+ ' + name + ' from ' + (source || 'custom source') + ' · scanned, then approved for groups'], 'onboardMcp', function () { comp.setState({ obOpen: false, obName: '', obSource: '' }); }); return false; }
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
        if (ok && evt.groupId) { var ex = {}; ex[evt.name] = evt.expiresAt ? new Date(evt.expiresAt).toISOString() : null; setGrants(evt.groupId, ex, true); }
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
      case 'mcpSuspended': comp.setState(function (st) { return { bridge: st.bridge.map(function (b) { return b.name === evt.name ? Object.assign({}, b, { status: evt.suspended ? 'Suspended' : 'Onboarded', date: window.__TODAY, by: evt.by }) : b; }) }; });
        if (!replaying) toast(evt.name + (evt.suspended ? ' suspended by ' + evt.by + ' — blocked for every group' : ' reinstated by ' + evt.by)); break;
      case 'mcpRemoved': comp.setState(function (st) { var a = Object.assign({}, st.access); delete a[evt.name]; return { bridge: st.bridge.filter(function (b) { return b.name !== evt.name; }), access: a }; });
        if (!replaying) toast(evt.name + ' deboarded by ' + evt.by + ' — removed from the MCP Bridge'); break;
      case 'mcpScanned': comp.setState(function (st) { return { bridge: st.bridge.map(function (b) { return b.id === evt.bridgeId || b.name === evt.name ? Object.assign({}, b, { status: b.status === 'Scanning' ? 'Awaiting approval' : b.status, scan: 'passed · ' + (evt.summary || '0 findings'), tools: evt.tools || b.tools, date: 'scanned ' + window.__TODAY }) : b; }) }; }); break;
      case 'sliceUpdated': if (evt.clientId !== CLIENT) { applySlice(evt.slice, evt.value); if (!replaying) toast(evt.by + ' saved a change to ' + LABEL[evt.slice]); } break;
      case 'accessChanged': if (evt.expires) setGrants(evt.groupId, evt.expires); if (evt.expired && !replaying) toast(evt.expired + ' access for ' + groupLabel(evt.groupId) + ' expired');
        comp.setState(function (st) { var a = Object.assign({}, st.access); Object.keys(a).forEach(function (n) { a[n] = Object.assign({}, a[n]); a[n][evt.groupConsoleId] = evt.allow.indexOf(n) >= 0 ? 1 : 0; }); return { access: a }; }); break;
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
      case 'notice': if ((evt.to || []).indexOf(U.id) >= 0) { loadInbox(); if (!replaying) toast('📥 ' + evt.text, function () { openInbox(evt.wf); }); } break;
      case 'workflow': case 'noticeRead': loadInbox(); break;
      case 'budgetException': if (!replaying && U.perms.viewAll) toast(evt.by + ' raised ' + evt.name + '’s daily cap to USD ' + evt.cap_usd + ' for 24 h'); break;
      default: break;
    }
  }
  function hydrate() {
    holdWatch(1500);
    fetch('/api/console/state').then(function (r) { return r.ok ? r.json() : { slices: {} }; }).catch(function () { return { slices: {} }; }).then(function (cs) {
      Object.keys(cs.slices || {}).forEach(function (k) { applySlice(k, cs.slices[k]); });
      return fetch('/api/state').then(function (r) { return r.json(); }).then(function (st) { replaying = true; try { (st.events || []).forEach(apply); } finally { replaying = false; } });
    }).catch(function () {}).then(function () { holdWatch(800); setTimeout(rebase, 500); loadInbox(); loadGrants(); });
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
            var forbidden = res.status === 403 || /FORBIDDEN/.test(res.j.code || '');
            applySlice(k, prev);
            if (forbidden && U.perms.viewAll) { var d = describeSlice(k, op, prev || [], cur); askApproval({ kind: 'console_change', slice: k, op: op, value: cur, title: d.title, changes: d.changes }, d.title, d.changes, need, null, op === 'createGroup' ? 'create groups' : op === 'retire' ? 'retire CUEs' : 'change ' + LABEL[k]); }
            else toast(forbidden ? 'Only ' + holders(need) + ' can change ' + LABEL[k] + '. Your change was not saved.' : (res.j.error || 'Change not saved.')); }
        }).catch(function () { inflight[k] = false; });
    });
  }
  function connect() { try { var es = new EventSource('/api/stream'); es.onmessage = function (e) { try { apply(JSON.parse(e.data)); } catch (x) { console.error('[bank bridge] event failed', x); } }; } catch (x) {} }

  // ---------- inbox: approvals waiting for me, my requests, notices ----------
  // Drawn as a side panel with the console's own tokens (fonts, #d5dce3 borders, 4px radii, the one popover shadow).
  var INBOX = { data: null, open: false, view: 'list', tab: null, sel: null, form: null };
  var DURATIONS = [[2, '2 minutes (demo)'], [60, '1 hour'], [480, '8 hours'], [1440, '24 hours'], [10080, '7 days'], [43200, '30 days'], [129600, '90 days'], [0, 'No expiry']];
  var DEFAULT_TTL = 43200;
  function ago(iso) { var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loadInbox() { return fetch('/api/inbox').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j) return; INBOX.data = j; if (comp) comp.setState({ inboxTick: Date.now() }); if (INBOX.open) renderPanel(); }).catch(function () {}); }
  function inboxCount() { var d = INBOX.data; if (!d) return 0; return d.pending_decisions + d.updates.filter(function (n) { return !n.read && n.kind === 'update'; }).length; }
  function myOpen(kind) { return ((INBOX.data || {}).my_requests || []).some(function (w) { return w.kind === kind && w.status === 'pending' && w.requested_by.id === U.id; }); }
  function myRequestRows() {
    return ((INBOX.data || {}).my_requests || []).filter(function (w) { return w.requested_by.id === U.id && ['pending', 'returned'].indexOf(w.status) >= 0; }).map(function (w) {
      return att(w.status === 'returned' ? 'SENT BACK' : 'YOUR REQUEST', w.status === 'returned' ? WARN : TEAL, w.title + (w.status === 'returned' ? ' — ' + (w.decision_note || 'see the note') : ' · waiting for ' + w.approvers.map(function (a) { return a.split(' (')[0]; }).join(' or ')), 'inbox · ' + ago(w.requested_at), function () { openInbox(w.id); });
    });
  }
  function openInbox(id) {
    INBOX.open = true; INBOX.form = null;
    if (id) { INBOX.view = 'detail'; INBOX.sel = id; api('POST', '/api/inbox/read', { workflow_id: id }).catch(function () {}); }
    else { INBOX.view = 'list'; INBOX.tab = INBOX.tab || ((INBOX.data || {}).pending_decisions ? 'decide' : 'updates'); }
    renderPanel(); if (comp) comp.setState({ inboxTick: Date.now() });
    if (!INBOX.data) loadInbox();
  }
  function closeInbox() { INBOX.open = false; INBOX.form = null; renderPanel(); if (comp) comp.setState({ inboxTick: Date.now() }); }
  function findWf(id) { var d = INBOX.data || {}; return (d.needs_decision || []).concat(d.my_requests || []).find(function (w) { return w.id === id; }); }

  // Security, or anyone missing a permission, sends the change for approval instead of being refused.
  function askApproval(body, title, changes, perm, after, verb) { INBOX.form = { type: 'ask', body: body, title: title, changes: changes || [], perm: perm, after: after, verb: verb }; INBOX.open = true; renderPanel(); }
  function grantDialog(o) { INBOX.form = Object.assign({ type: 'grant' }, o); INBOX.open = true; renderPanel(); }
  function confirmDialog(title, changes, label, fn) { INBOX.form = { type: 'confirm', title: title, changes: changes, label: label, fn: fn }; INBOX.open = true; renderPanel(); }
  function recommendMcp(bid, name, rec) { INBOX.form = { type: 'recommend', bridgeId: bid, name: name, rec: rec }; INBOX.open = true; renderPanel(); }

  // Plain-language summary of a console change, for the approver.
  function describeSlice(k, op, prev, cur) {
    var out = [], byId = function (a) { var m = {}; (a || []).forEach(function (x) { m[x.id] = x; }); return m; };
    if (k === 'roles' || k === 'cues' || k === 'policies') {
      var P0 = byId(prev), C0 = byId(cur), nm = function (x) { return x.name || (x.tool ? x.tool + '/' + x.role + '@v' + x.v : x.id); };
      (cur || []).forEach(function (x) { var o = P0[x.id]; if (!o) { out.push('+ ' + (k === 'roles' ? 'new group ' : 'new ') + nm(x)); return; }
        if (k === 'roles' && o.active !== x.active) out.push((x.active ? '+ reactivate group ' : '− deactivate group ') + nm(x));
        else if (k === 'cues' && x.state === 'retired' && o.state !== 'retired') out.push('− retire ' + nm(x));
        else if (k === 'cues' && x.v !== o.v) out.push('+ ' + nm(x) + ' (was v' + o.v + ')');
        else if (JSON.stringify(o) !== JSON.stringify(x)) out.push('~ ' + nm(x) + ': ' + Object.keys(x).filter(function (f) { return JSON.stringify(o[f]) !== JSON.stringify(x[f]); }).slice(0, 4).join(', ') + ' changed'); });
      (prev || []).forEach(function (x) { if (!C0[x.id]) out.push('− remove ' + nm(x)); });
    } else if (k === 'settings') { ['rates', 'caps', 'capModes'].forEach(function (f) { if (JSON.stringify((prev || {})[f]) !== JSON.stringify((cur || {})[f])) out.push('~ ' + ({ rates: 'model rates', caps: 'budget caps', capModes: 'budget modes' })[f] + ' changed'); }); }
    else if (k === 'fleetRoles') { Object.keys(cur || {}).forEach(function (d) { if ((prev || {})[d] !== cur[d]) out.push('→ ' + d + ' moved to ' + ((S.ROLE_NAMES || {})[cur[d]] || cur[d] || 'no group')); }); }
    if (!out.length) out.push('~ ' + LABEL[k] + ' changed');
    var t = out[0].replace(/^[+−~→] /, ''); return { title: t.charAt(0).toUpperCase() + t.slice(1) + (out.length > 1 ? ' (+' + (out.length - 1) + ' more)' : ''), changes: out.slice(0, 12) };
  }

  // Time-limited MCP access: expiry per group, shown next to each grant on the MCP Bridge.
  var GRANTS = {};   // mcp name -> console group id -> expiry ms | null
  function apiToConsole(gid) { var g = (S.ROLES0 || []).find(function (r) { return r.api_id === gid; }); return g ? g.id : gid; }
  function setGrants(gid, exp, merge) { var cg = apiToConsole(gid); Object.keys(GRANTS).forEach(function (n) { if (!merge && GRANTS[n][cg] !== undefined && !(n in exp)) delete GRANTS[n][cg]; }); Object.keys(exp || {}).forEach(function (n) { GRANTS[n] = GRANTS[n] || {}; GRANTS[n][cg] = exp[n] ? new Date(exp[n]).getTime() : null; }); if (comp) comp.setState({ expTick: Date.now() }); }
  function loadGrants() {
    if (!U.perms.viewAll) return;
    fetch('/api/control/mcp-bridge').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      GRANTS = {}; (list || []).forEach(function (b) { (b.groups_with_access || []).forEach(function (g) { GRANTS[b.name] = GRANTS[b.name] || {}; GRANTS[b.name][apiToConsole(g.id)] = g.access_expires_at ? new Date(g.access_expires_at).getTime() : null; }); });
      if (comp) comp.setState({ expTick: Date.now() });
    }).catch(function () {});
  }
  function left(ms) { var m = Math.max(0, Math.round((ms - Date.now()) / 60000)); return m < 60 ? m + 'm' : m < 2880 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
  window.__rsExp = function (name, cgid, short) { var t = (GRANTS[name] || {})[cgid]; if (!t) return ''; return short ? ' · ' + left(t) : ' (' + left(t) + ' left)'; };
  setInterval(function () { if (comp && Object.keys(GRANTS).some(function (n) { return Object.keys(GRANTS[n]).some(function (g) { return GRANTS[n][g]; }); })) comp.setState({ expTick: Date.now() }); }, 20000);

  // ---- panel ----
  var panel = null, BAR = null;
  var CHIP = { pending: ['Waiting', '#EAF0FC', '#2B5FCB'], approved: ['Approved', '#E7F6EE', '#157F4E'], rejected: ['Rejected', '#FCE9EA', '#C4293A'], returned: ['Sent back', '#FDF1E4', '#B4530A'], withdrawn: ['Withdrawn', '#EEF0F2', '#6B7686'], stale: ['Out of date', '#EEF0F2', '#6B7686'] };
  var MONO = "font-family:'JetBrains Mono',monospace;", KICK = MONO + 'font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#5b6773;';
  var BTN = 'border:1px solid #d5dce3;background:#fff;border-radius:4px;padding:6px 12px;cursor:pointer;font:500 12.5px Poppins,sans-serif;color:#0B1220;';
  var PRIMARY = 'border:1px solid #4F5BD5;background:#4F5BD5;color:#fff;border-radius:4px;padding:6px 12px;cursor:pointer;font:500 12.5px Poppins,sans-serif;';
  function chip(st) { var c = CHIP[st] || CHIP.pending; return '<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:3px;font-size:11.5px;background:' + c[1] + ';color:' + c[2] + ';white-space:nowrap">' + c[0] + '</span>'; }
  function diffLines(lines) { return (lines || []).map(function (t) { var s0 = t.charAt(0), bg = s0 === '+' ? '#E7F6EE' : s0 === '−' ? '#FCE9EA' : '#f4f6f8', col = s0 === '+' ? '#157F4E' : s0 === '−' ? '#C4293A' : '#4a5563'; return '<div style="' + MONO + 'font-size:11.5px;padding:4px 8px;background:' + bg + ';color:' + col + ';border-radius:2px;margin-bottom:3px">' + esc(t) + '</div>'; }).join(''); }
  function durSelect(id, def) { return '<select id="' + id + '" style="border:1px solid #d5dce3;border-radius:2px;padding:5px 8px;font-size:12.5px;background:#fff;font-family:Poppins,sans-serif">' + DURATIONS.map(function (d) { return '<option value="' + d[0] + '"' + (d[0] === def ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select>'; }
  function field(label, html) { return '<div style="margin-top:12px"><div style="' + KICK + 'margin-bottom:4px">' + label + '</div>' + html + '</div>'; }
  function noteBox(id, ph) { return '<textarea id="' + id + '" rows="2" placeholder="' + esc(ph) + '" style="width:100%;box-sizing:border-box;border:1px solid #d5dce3;border-radius:2px;padding:6px 8px;font:12.5px Poppins,sans-serif;resize:vertical"></textarea>'; }
  function item(w) {
    var who = w.requested_by.name + ' · ' + w.requested_by.role;
    return '<button data-open="' + w.id + '" style="display:block;width:100%;text-align:left;background:#fff;border:1px solid #d5dce3;border-radius:4px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:Poppins,sans-serif;color:#0B1220">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="' + KICK + '">' + esc(w.kind_label) + '</span>' + chip(w.status) + '</div>' +
      '<div style="font-size:13px;font-weight:600;margin-top:4px">' + esc(w.title) + '</div>' +
      '<div style="font-size:12px;color:#5b6773;margin-top:2px">' + esc(who) + ' · ' + ago(w.requested_at) + (w.recommendations.length ? ' · ' + w.recommendations.map(function (r) { return r.by.split(' ')[0] + ' recommends ' + (r.recommendation === 'block' ? 'block' : 'approve'); }).join(' · ') : '') + '</div></button>';
  }
  function listView() {
    var d = INBOX.data || { needs_decision: [], my_requests: [], updates: [] };
    var canDecide = U.perms.decideMcp || U.perms.publishCue || U.perms.settingsWrite;
    var tabs = [canDecide ? ['decide', 'Needs your decision', d.needs_decision.length] : null, U.id !== 'weiling' ? ['mine', 'My requests', d.my_requests.length] : null, ['updates', 'Updates', d.updates.filter(function (n) { return !n.read; }).length]].filter(Boolean);
    if (!tabs.some(function (t) { return t[0] === INBOX.tab; })) INBOX.tab = tabs[0][0];
    var h = '<div style="display:flex;gap:4px;border-bottom:1px solid #e3e8ed;margin:0 -18px 12px;padding:0 18px">' + tabs.map(function (t) { var on = INBOX.tab === t[0]; return '<button data-tab="' + t[0] + '" style="border:0;background:none;padding:8px 8px;cursor:pointer;font:' + (on ? 600 : 500) + ' 12.5px Poppins,sans-serif;color:' + (on ? '#4F5BD5' : '#5b6773') + ';border-bottom:2px solid ' + (on ? '#4F5BD5' : 'transparent') + '">' + t[1] + (t[2] ? ' <span style="' + MONO + 'font-size:10.5px;color:#B4530A">' + t[2] + '</span>' : '') + '</button>'; }).join('') + '</div>';
    if (INBOX.tab === 'decide') h += d.needs_decision.length ? d.needs_decision.map(item).join('') : '<div style="font-size:12.5px;color:#9aa5b1">Nothing is waiting for your decision.</div>';
    if (INBOX.tab === 'mine') h += d.my_requests.length ? d.my_requests.map(item).join('') : '<div style="font-size:12.5px;color:#9aa5b1">You have not asked for anything yet. When your role cannot make a change, the console offers to send it for approval.</div>';
    if (INBOX.tab === 'updates') h += (d.updates.length ? '<div style="text-align:right;margin:-4px 0 6px"><button data-readall="1" style="border:0;background:none;color:#4F5BD5;cursor:pointer;font-size:12px;padding:0">Mark all read</button></div>' + d.updates.map(function (n) {
      return '<button data-open="' + n.workflow_id + '" style="display:flex;gap:10px;width:100%;text-align:left;background:' + (n.read ? '#fff' : '#f8fafb') + ';border:0;border-bottom:1px solid #eef1f4;padding:9px 4px;cursor:pointer;font-family:Poppins,sans-serif;color:#0B1220"><span style="width:6px;height:6px;border-radius:50%;margin-top:6px;flex:none;background:' + (n.read ? 'transparent' : n.kind === 'action' ? '#B4530A' : '#4F5BD5') + '"></span><span style="min-width:0"><span style="display:block;font-size:12.5px;' + (n.read ? '' : 'font-weight:500') + '">' + esc(n.text) + '</span><span style="display:block;' + MONO + 'font-size:10.5px;color:#9aa5b1;margin-top:2px">' + esc(n.by) + ' · ' + ago(n.at) + (n.kind === 'action' ? ' · needs a decision' : '') + '</span></span></button>';
    }).join('') : '<div style="font-size:12.5px;color:#9aa5b1">No updates yet.</div>');
    return h;
  }
  function detailView(w) {
    if (!w) return '<div style="font-size:12.5px;color:#9aa5b1">Loading…</div>';
    var h = '<button data-back="1" style="border:0;background:none;color:#4F5BD5;cursor:pointer;font-size:12px;padding:0;margin-bottom:8px">← Inbox</button>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="' + KICK + '">' + esc(w.kind_label) + '</span>' + chip(w.status) + '</div>' +
      '<div style="font-size:16px;font-weight:600;margin:4px 0 2px;line-height:1.35">' + esc(w.title) + '</div>' +
      '<div style="font-size:12.5px;color:#5b6773">' + esc(w.requested_by.name) + ' · ' + esc(w.requested_by.role) + ' · ' + ago(w.requested_at) + (w.via ? ' · from ' + ({ me: 'My access', terminal: 'the terminal', console: 'the console' })[w.via] : '') + '</div>';
    if (w.reason) h += '<div style="margin-top:10px;font-size:12.5px;border-left:3px solid #d5dce3;padding:2px 10px;color:#4a5563">“' + esc(w.reason) + '”</div>';
    h += field('What changes if approved', diffLines(w.changes));
    if (w.facts && w.facts.length) h += '<div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 10px;font-size:12.5px;margin-top:10px">' + w.facts.map(function (f) { return '<span style="color:#5b6773">' + esc(f[0]) + '</span><span>' + esc(f[1]) + '</span>'; }).join('') + '</div>';
    h += field('Who decides', '<div style="font-size:12.5px">' + esc(w.approvers.join(' or ')) + '</div>');
    if (w.recommendations.length) h += field('Security recommendation', w.recommendations.map(function (r) { return '<div style="font-size:12.5px"><b style="font-weight:600;color:' + (r.recommendation === 'block' ? '#C4293A' : '#157F4E') + '">' + (r.recommendation === 'block' ? 'Block' : 'Approve') + '</b> · ' + esc(r.by) + (r.note ? ' — “' + esc(r.note) + '”' : '') + '</div>'; }).join(''));
    if (w.can.decide) {
      h += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e3e8ed">' + (w.takes_duration ? field('Access lasts', durSelect('ibDur', w.asked_duration_minutes || DEFAULT_TTL) + '<div style="font-size:11.5px;color:#5b6773;margin-top:4px">When it expires the server removes it from the group and tells ' + esc(w.requested_by.name) + '.</div>') : '') +
        field('Note (required to send back)', noteBox('ibNote', 'Optional note for ' + w.requested_by.name)) +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap"><button data-decide="return" style="' + BTN + '">Send back</button><button data-decide="reject" style="' + BTN + 'color:#C4293A">' + esc(w.labels.reject) + '</button><button data-decide="approve" style="' + PRIMARY + '">' + esc(w.labels.approve) + '</button></div></div>';
    } else if (w.can.recommend) {
      h += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e3e8ed">' + field('Your recommendation to ' + w.approvers.map(function (a) { return a.split(' (')[0]; }).join(' or '), noteBox('ibNote', 'Why (optional)')) +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button data-rec="block" style="' + BTN + 'color:#C4293A">Recommend block</button><button data-rec="approve" style="' + PRIMARY + '">Recommend approve</button></div></div>';
    }
    if (w.status === 'returned' && w.decision_note) h += '<div style="margin-top:12px;background:#FDF1E4;border-radius:4px;padding:8px 12px;font-size:12.5px;color:#8a4207">Sent back by ' + esc(w.decided_by) + ': “' + esc(w.decision_note) + '”</div>';
    if (w.can.withdraw || w.resubmit_body) h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' + (w.can.withdraw ? '<button data-withdraw="1" style="' + BTN + '">Withdraw</button>' : '') + (w.resubmit_body ? '<button data-resubmit="1" style="' + PRIMARY + '">Resubmit</button>' : '') + '</div>';
    h += field('History', w.history.map(function (x) { return '<div style="display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid #f1f3f5"><span style="' + MONO + 'font-size:10.5px;color:#9aa5b1">' + ago(new Date(x.at).toISOString()) + '</span><span><b style="font-weight:500">' + esc(x.by) + '</b> ' + esc(x.action) + (x.note ? ' <span style="color:#5b6773">· ' + esc(x.note) + '</span>' : '') + '</span></div>'; }).join(''));
    if (w.link && w.link.page) h += '<div style="margin-top:12px"><button data-link="1" style="border:0;background:none;color:#4F5BD5;cursor:pointer;font-size:12.5px;padding:0">Open in the console →</button></div>';
    return h;
  }
  function formView(f) {
    if (f.type === 'ask') return '<div style="' + KICK + '">Request approval</div><div style="font-size:16px;font-weight:600;margin:4px 0 6px;line-height:1.35">' + esc(f.title) + '</div>' +
      '<div style="font-size:12.5px;color:#4a5563;line-height:1.5">' + esc(U.name) + ' (' + esc(U.roleLabel || U.role) + ') cannot ' + esc(f.verb || ACTION[f.perm] || 'make this change') + ' directly. Send it to ' + esc(holders(f.perm)) + ' — it waits in their inbox and runs when one of them approves.</div>' +
      field('What changes if approved', diffLines(f.changes)) + field('Reason', noteBox('ibNote', 'Why is this needed?')) +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-cancel="1" style="' + BTN + '">Discard</button><button data-send="1" style="' + PRIMARY + '">Send for approval</button></div>';
    if (f.type === 'recommend') return '<div style="' + KICK + '">Recommend</div><div style="font-size:16px;font-weight:600;margin:4px 0 6px">' + (f.rec === 'block' ? 'Block ' : 'Approve ') + esc(f.name) + '</div>' +
      '<div style="font-size:12.5px;color:#4a5563;line-height:1.5">Only ' + esc(holders('decideMcp')) + ' decide MCP servers. Your recommendation is added to the request and they are notified.</div>' + field('Why', noteBox('ibNote', 'e.g. read-only, scan passed, runbooks only')) +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-cancel="1" style="' + BTN + '">Cancel</button><button data-send="1" style="' + PRIMARY + '">Send recommendation</button></div>';
    if (f.type === 'grant') {
      var groups = (S.ROLES0 || []).map(function (g) { return '<option value="' + g.api_id + '"' + (g.api_id === f.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
      return '<div style="' + KICK + '">Grant MCP access</div><div style="font-size:16px;font-weight:600;margin:4px 0 6px">' + esc(f.name) + (f.who ? ' · requested by ' + esc(f.who) : '') + '</div>' +
        (f.reason ? '<div style="font-size:12.5px;border-left:3px solid #d5dce3;padding:2px 10px;color:#4a5563">“' + esc(f.reason) + '”</div>' : '') +
        field('Group', f.policyAllow ? '<div style="font-size:12.5px">' + esc(groupLabel(f.groupId)) + '</div>' : '<select id="ibGroup" style="border:1px solid #d5dce3;border-radius:2px;padding:5px 8px;font-size:12.5px;background:#fff;font-family:Poppins,sans-serif">' + groups + '</select>') +
        field('Access lasts', durSelect('ibDur', DEFAULT_TTL) + '<div style="font-size:11.5px;color:#5b6773;margin-top:4px">Short-lived by default. When it expires the server removes it from the group; people can ask again to renew.</div>') +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-cancel="1" style="' + BTN + '">Cancel</button><button data-send="1" style="' + PRIMARY + '">Approve</button></div>';
    }
    if (f.type === 'confirm') return '<div style="' + KICK + '">MCP Bridge</div><div style="font-size:16px;font-weight:600;margin:4px 0 6px">' + esc(f.title) + '</div>' + field('What happens', diffLines(f.changes)) + field('Reason (kept in the audit trail)', noteBox('ibNote', 'e.g. vendor advisory, suspicious tool output')) +
      '<div style="font-size:11.5px;color:#5b6773;margin-top:6px">Reducing access takes effect at once and needs no second approver.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-cancel="1" style="' + BTN + '">Cancel</button><button data-send="1" style="' + PRIMARY.replace(/#4F5BD5/g, '#C4293A') + '">' + esc(f.label) + '</button></div>';
    return '';
  }
  function renderPanel() {
    if (!panel) {
      panel = document.createElement('aside'); panel.setAttribute('aria-label', 'Inbox');
      panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(460px,100vw);z-index:99990;background:#fff;border-left:1px solid #d5dce3;box-shadow:0 1px 2px rgba(11,14,18,0.06),0 4px 12px rgba(11,14,18,0.10);display:flex;flex-direction:column;font:13px/1.45 Poppins,sans-serif;color:#0B1220;box-sizing:border-box';
      panel.addEventListener('click', onPanelClick); document.body.appendChild(panel);
    }
    panel.style.display = INBOX.open ? 'flex' : 'none';
    if (BAR) BAR.style.right = INBOX.open && window.innerWidth > 900 ? 'calc(min(460px, 100vw) + 14px)' : '14px'; // keep the demo bar clear of the panel
    if (!INBOX.open) return;
    var body = INBOX.form ? formView(INBOX.form) : INBOX.view === 'detail' ? detailView(findWf(INBOX.sel) || INBOX.selData) : listView();
    if (INBOX.view === 'detail' && !INBOX.form && !findWf(INBOX.sel) && (!INBOX.selData || INBOX.selData.id !== INBOX.sel)) fetch('/api/workflows/' + INBOX.sel).then(function (r) { return r.ok ? r.json() : null; }).then(function (w) { if (w) { INBOX.selData = w; renderPanel(); } });
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 18px 10px"><div><div style="' + KICK + '">Inbox</div><div style="font-size:16px;font-weight:600;margin-top:2px">Approvals and updates</div></div><button data-close="1" title="Close" style="border:0;background:none;cursor:pointer;font-size:18px;color:#5b6773;line-height:1">×</button></div>' +
      '<div style="flex:1;overflow:auto;padding:0 18px 18px">' + body + '</div>' +
      '<div style="padding:8px 18px;border-top:1px solid #e3e8ed;' + MONO + 'font-size:10.5px;color:#9aa5b1">Demo data · fictional</div>';
  }
  function busy(el) { if (el) { el.disabled = true; el.style.opacity = '.6'; } }
  function onPanelClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    var note = function () { var n = document.getElementById('ibNote'); return n ? n.value.trim() : ''; };
    var dur = function () { var d = document.getElementById('ibDur'); return d ? Number(d.value) : undefined; };
    if (t.dataset.close) return closeInbox();
    if (t.dataset.tab) { INBOX.tab = t.dataset.tab; return renderPanel(); }
    if (t.dataset.back) { INBOX.view = 'list'; return renderPanel(); }
    if (t.dataset.readall) return api('POST', '/api/inbox/read', {}).then(loadInbox).catch(function () {});
    if (t.dataset.open) { if (t.dataset.open === 'expiry') return; return openInbox(t.dataset.open); }
    if (t.dataset.cancel) { INBOX.form = null; if (!INBOX.sel) INBOX.open = false; return renderPanel(); }
    if (t.dataset.link) { var w0 = findWf(INBOX.sel) || INBOX.selData; closeInbox(); comp.go(w0.link.page, w0.link.extra); window.scrollTo(0, 0); return; }
    var w = findWf(INBOX.sel) || INBOX.selData;
    if (t.dataset.decide) {
      if (t.dataset.decide === 'return' && !note()) { toast('Say what should change before sending it back.'); return; }
      busy(t); var m = dur();
      api('POST', '/api/workflows/' + w.id + '/decision', { decision: t.dataset.decide, note: note() || undefined, access_ttl_minutes: w.takes_duration ? m : undefined })
        .then(function (r) { toast(r.title + ' · ' + (CHIP[r.status] || [r.status])[0].toLowerCase()); INBOX.selData = r; return loadInbox(); }).catch(function () { loadInbox(); });
      return;
    }
    if (t.dataset.rec) { busy(t); api('POST', '/api/workflows/' + w.id + '/recommendation', { recommendation: t.dataset.rec, note: note() || undefined }).then(function () { toast('Recommendation sent to ' + holders('decideMcp')); return loadInbox(); }).catch(function () {}); return; }
    if (t.dataset.withdraw) { busy(t); api('POST', '/api/workflows/' + w.id + '/withdraw').then(function () { toast('Request withdrawn'); return loadInbox(); }).catch(function () {}); return; }
    if (t.dataset.resubmit) { busy(t); api('POST', '/api/workflows', Object.assign({}, w.resubmit_body, { reason: w.reason })).then(function (r) { toast('Resubmitted · ' + r.approvers.map(function (a) { return a.split(' (')[0]; }).join(' and ') + ' notified'); INBOX.sel = r.id; return loadInbox(); }).catch(function () {}); return; }
    if (t.dataset.send) {
      var f = INBOX.form; busy(t);
      if (f.type === 'ask') {
        api('POST', '/api/workflows', Object.assign({}, f.body, { reason: note() || undefined })).then(function (r) {
          toast('Sent for approval · ' + r.approvers.map(function (a) { return a.split(' (')[0]; }).join(' and ') + ' notified', function () { openInbox(r.id); });
          if (f.after) f.after(); INBOX.form = null; INBOX.view = 'detail'; INBOX.sel = r.id; INBOX.selData = r; return loadInbox();
        }).catch(function () { INBOX.form = null; renderPanel(); });
      } else if (f.type === 'recommend') {
        api('POST', '/api/workflows', { kind: 'mcp_decision', bridge_id: f.bridgeId, recommendation: f.rec, reason: note() || undefined }).then(function (r) {
          toast('Recommendation sent to ' + holders('decideMcp')); INBOX.form = null; INBOX.view = 'detail'; INBOX.sel = r.id; INBOX.selData = r; return loadInbox();
        }).catch(function () { INBOX.form = null; renderPanel(); });
      } else if (f.type === 'grant') {
        var m = dur(), gid = f.policyAllow ? f.groupId : (document.getElementById('ibGroup') || {}).value;
        var p = f.policyAllow
          ? api('PUT', '/api/control/groups/' + gid + '/mcp-policy', { allow: f.policyAllow, expires: (function () { var o = {}; o[f.name] = m ? new Date(Date.now() + m * 60000).toISOString() : null; return o; })() })
          : api('PATCH', '/api/control/mcp-bridge/' + f.bridgeId, { status: 'approved', group_id: gid, access_ttl_minutes: m || undefined, approved_reason: note() || undefined });
        p.then(function () { toast(f.name + ' approved for ' + groupLabel(gid) + ' · ' + (DURATIONS.find(function (d) { return d[0] === m; }) || [0, ''])[1].toLowerCase()); INBOX.form = null; INBOX.open = false; renderPanel(); loadGrants(); }).catch(function () { INBOX.form = null; renderPanel(); });
      } else if (f.type === 'confirm') {
        f.fn(note()).then(function () { INBOX.form = null; INBOX.open = false; renderPanel(); loadInbox(); }).catch(function () { INBOX.form = null; renderPanel(); });
      }
    }
  }

  // ---------- demo control bar ----------
  function mountBar() {
    var bar = BAR = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;background:#0B1220;color:#fff;border-radius:10px;padding:10px 12px;font:12px/1.4 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(92vw,640px)';
    var who = document.createElement('span'); who.style.cssText = 'opacity:.85;margin-right:2px'; who.textContent = U.name + ' · ' + (U.title || U.role); bar.appendChild(who);
    function btn(label, fn, bg) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'border:0;border-radius:7px;padding:6px 10px;font:600 12px -apple-system,sans-serif;cursor:pointer;background:' + (bg || '#2b3550') + ';color:#fff'; b.onclick = fn; bar.appendChild(b); return b; }
    (U.demoBar || []).forEach(function (k) {
      if (k === 'approve-confluence') btn('Approve confluence MCP · 30 days', function () { api('PATCH', '/api/control/mcp-bridge/mcp_confluence', { status: 'approved', group_id: 'grp_payments_eng', access_ttl_minutes: 43200, approved_reason: 'Read-only runbooks for settlement debugging · Engineering — Payments' }).catch(function () {}); }, '#3a7d57');
      if (k === 'publish-cue-v4') btn('Publish Payments CUE v4', function () { api('POST', '/api/control/cues/cue_payments_v3/publish').catch(function () {}); }, '#3a5a9d');
      if (k === 'reset') btn('Reset demo', function () { if (confirm('Reset the Straits Meridian demo to its starting state?')) api('POST', '/api/demo/reset').catch(function () {}); }, '#6b3b3b');
    });
    var ib = btn('Inbox', function () { openInbox(); }, '#4F5BD5');
    setInterval(function () { var n = inboxCount(); ib.textContent = 'Inbox' + (n ? ' · ' + n : ''); }, 800);
    btn('Sign out', signOut, '#2b3550');
    document.body.appendChild(bar);
  }
  var toastEl = null, toastT = null;
  function toast(msg, onClick) {
    if (replaying) return;
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:99999;background:#0B1220;color:#fff;padding:9px 14px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);transition:opacity .2s;max-width:90vw'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg + (onClick ? '  · Open' : ''); toastEl.style.opacity = '1'; toastEl.style.cursor = onClick ? 'pointer' : 'default'; toastEl.onclick = onClick ? function () { toastEl.style.opacity = '0'; onClick(); } : null;
    toastEl.style.pointerEvents = 'auto';
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = '0'; toastEl.style.pointerEvents = 'none'; }, onClick ? 7000 : 4200);
  }
})();
