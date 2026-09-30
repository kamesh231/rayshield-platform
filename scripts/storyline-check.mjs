// Runs the Straits Meridian storyline (data/tenants/straits-meridian/storyline.json) end to end against
// a running server, asserting each beat's expected change. Resets the demo before and after.
// Run: DEMO_TENANT=straits-meridian npm start, then  BASE=http://localhost:3000 node scripts/storyline-check.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
const jar = {};
async function login(u) { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'demo' }) }); jar[u] = r.headers.get('set-cookie').split(';')[0]; }
const call = async (u, method, url, body) => { const r = await fetch(BASE + url, { method, headers: { Cookie: jar[u], 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const term = async (cmd, host = 'LT-SG-2231') => (await call('rahul', 'POST', '/api/terminal/exec', { host, cmd })).body.out.replace(/\x1b\[[0-9;]*m/g, '');
const wait = ms => new Promise(r => setTimeout(r, ms));
const lines = []; let bad = 0;
const check = (ok, label) => { lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) bad++; };
const beat = t => lines.push(t);

for (const u of ['weiling', 'arjun', 'priscilla', 'rahul']) await login(u);
await call('weiling', 'POST', '/api/demo/reset');

beat('1 · CISO frames it (priscilla)');
const s0 = (await call('priscilla', 'GET', '/api/discovery/summary')).body, f0 = (await call('priscilla', 'GET', '/api/devices/summary')).body, d0 = (await call('priscilla', 'GET', '/api/detections/summary')).body.totals;
const gov0 = s0.services - s0.governance.unlabelled;
check(gov0 === 23 && s0.services === 27, `${gov0} of ${s0.services} governed`);
check(s0.shadow_share_pct === 3.1 && s0.previous.shadow_share_pct === 5.4, `shadow share ${s0.shadow_share_pct} % (previous ${s0.previous.shadow_share_pct} %)`);
check(Math.round(f0.enforcing / f0.endpoints * 100) === 90, `${Math.round(f0.enforcing / f0.endpoints * 100)} % enforcing (${f0.enforcing}/${f0.endpoints})`);
check(d0.critical === 17, `${d0.critical} critical detections, all contained`);

beat('2 · Developer works (rahul, terminal + /me)');
const boot = await term('aegis run claude-code --src ./settlement-recon --writable');
check(/payments-eng@v3/.test(boot) && /inherited from Bank baseline/.test(boot) && /dlp-card-pan/.test(boot), 'boots under Payments Engineering v3 with inherited egress + DLP');
const blocked = await term('claude "find why yesterday\'s card settlement is off by SGD 1,240"');
check(/BLOCKED/.test(blocked) && /card PAN \+ NRIC/.test(blocked) && /nothing transmitted/.test(blocked), 'DLP blocks card PAN + NRIC before the prompt leaves');
const myDet = (await call('rahul', 'GET', '/api/me/detections')).body;
check(myDet.length >= 5 && myDet[0].rule_id === 'CARD-PAN' && !!myDet[0].why, `/me shows the new block first with why + fix (${myDet.length} blocked events)`);
const d1 = (await call('arjun', 'GET', '/api/detections/summary')).body.totals;
check(d1.detections === d0.detections + 1 && d1.critical === d0.critical + 1, `live detection reaches Security: ${d0.detections} → ${d1.detections}`);

beat('3 · Security triages (arjun)');
const hero = (await call('arjun', 'GET', '/api/detections/det_01JA4K9PAN1')).body;
check(hero.disposition === 'escalated' && hero.evidence.sensitive_content.snippet_redacted.includes('••••'), 'escalated card-data detection with masked evidence');
const tree = (await call('arjun', 'GET', '/api/protect/executions/exec_01JA4K9PAN1/graph')).body;
check(tree.nodes.map(n => n.kind).join('>') === 'endpoint>cue>mcp_sandbox>credential>data>dlp_outcome' && /1,240 rows/.test(tree.nodes[4].label), 'blast tree endpoint → CUE → postgres-mcp → .env → cards.txn_ledger 1,240 rows → blocked');
const draft = (await call('arjun', 'GET', '/api/control/cues/cue_payments_v4_draft')).body;
check(draft.state === 'draft' && draft.dlp_rules.some(r => r.value === 'dlp-mask-query-results'), 'Payments CUE draft v4 adds dlp-mask-query-results');
check((await call('arjun', 'PUT', '/api/discovery/services/perplexity/status', { status: 'under_review' })).status === 200, 'labels Perplexity under review');
const s1 = (await call('arjun', 'GET', '/api/discovery/summary')).body;
check(s1.services - s1.governance.unlabelled === 24, `governed moves to ${s1.services - s1.governance.unlabelled} of 27`);
const deny = await call('arjun', 'PATCH', '/api/control/mcp-bridge/mcp_confluence', { status: 'approved' });
check(deny.status === 403 && deny.body.code === 'FORBIDDEN', 'approve confluence refused (403 FORBIDDEN)');

beat('4 · Developer asks (rahul)');
const req = await term('aegis mcp request confluence --reason "read runbooks while debugging settlement"');
check(/awaiting decision/.test(req) && /scanning/.test(req), 'terminal: scanning → awaiting decision');
const reqs = (await call('rahul', 'GET', '/api/me/mcp-requests')).body;
check(reqs.some(r => r.name === 'confluence' && r.status === 'awaiting_decision'), '/me: confluence · awaiting decision');
check(/BLOCKED/.test(await term('claude "open the runbook for settlement retries"')), 'runbook blocked before approval');

beat('5 · CISO decides (priscilla)');
const appr = await call('priscilla', 'PATCH', '/api/control/mcp-bridge/mcp_confluence', { status: 'approved', group_id: 'grp_payments_eng' });
check(appr.status === 200 && appr.body.status === 'approved' && appr.body.groups_with_access.some(g => g.id === 'grp_payments_eng'), 'confluence approved for Engineering — Payments');
const pub = await call('priscilla', 'POST', '/api/control/cues/cue_payments_v3/publish');
check(pub.status === 200 && pub.body.version === 4, 'Payments CUE v4 published');
await wait(1500);
const acc = (await call('rahul', 'GET', '/api/me/access')).body;
check(acc.cue.version === 4 && acc.dlp_rules.includes('dlp-mask-query-results') && acc.mcp_servers.includes('confluence'), '/me: CUE v4 with dlp-mask-query-results · confluence available');

beat('6 · Developer unblocked (rahul)');
check(/PAY-RB-014/.test(await term('claude "open the runbook for settlement retries"')), 'runbook opens via confluence');
const masked = await term('claude "summarise today\'s settlement exceptions"');
const d2 = (await call('arjun', 'GET', '/api/detections/summary')).body.totals;
check(/masked/.test(masked) && /No detection/.test(masked) && d2.detections === d1.detections, 'query result arrives masked, task succeeds, no new detection');

beat('7 · Admin closes the loop (weiling)');
const cue = (await call('weiling', 'GET', '/api/control/cues')).body.find(c => c.id === 'cue_payments_v3');
check(cue.latest_version === 4 && cue.endpoints_on_older === 6, `Payments v4 · ${cue.endpoints_on_older} endpoints still catching up`);
const sens = (await call('weiling', 'GET', '/api/sensors')).body.discovery.find(s => /zscaler/.test(s.sensor));
check(sens.health === 'silent', 'sase_zscaler silent 2 h 40 m');
const grp = (await call('weiling', 'GET', '/api/control/groups')).body.find(g => g.id === 'grp_contractors');
check(Math.round((grp.recert_due - 1790560800) / 86400) === 14, 'contractor recertification due in 14 days');
check((await call('weiling', 'POST', '/api/demo/reset')).status === 200, 'Reset demo');
const s3 = (await call('weiling', 'GET', '/api/discovery/summary')).body;
check(s3.services - s3.governance.unlabelled === 23, 'after reset: back to 23 of 27');

console.log(lines.join('\n'));
console.log(`\n${bad ? bad + ' FAILED' : 'STORYLINE OK'} (${lines.filter(l => l.includes('PASS')).length} checks passed)`);
process.exit(bad ? 1 : 0);
