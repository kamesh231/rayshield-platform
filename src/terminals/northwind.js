// Scripted endpoint terminals for the demo.
//
// SAFETY: nothing here executes, and no working exploit payloads are written. The "attack"
// storyline is represented purely as Aegis DETECTING and BLOCKING a threat — the malicious
// command is shown defanged (placeholder hosts, redacted bodies), never as a runnable string.
// Phase B replaces this file with a real shell inside an isolated container plus a reporting
// agent that emits the same console event shapes (see src/state.js).
import crypto from 'node:crypto';
import { getState, emit, nextDetectionStamp, clock } from '../state.js';

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', blu: '\x1b[34m', mag: '\x1b[35m', cyn: '\x1b[36m', gry: '\x1b[90m' };
const A = `${C.cyn}aegis ▸${C.r}`;
const OK = `${C.grn}✓${C.r}`;
const BLOCK = t => `${C.red}${C.b}BLOCKED${C.r}${C.red} — ${t}${C.r}`;
const sid = () => crypto.randomBytes(6).toString('hex');

export const HOSTS = {
  'LT-4821': {
    label: 'LT-4821 — Dev Patel · MacBook Pro',
    owner: 'Dev Patel', detHost: 'dev-patel-mbp', role: 'engineering',
    user: 'dev.patel', cwd: '~/src/payments-api',
    sandbox: 'libkrun', devId: 'dev-4f1c2a9e',
    spiffe: 'spiffe://northwind.example/user/dev.patel',
  },
  'vm-ci-build-214': {
    label: 'vm-ci-build-214 — CI build agent',
    owner: 'svc-ci', detHost: 'vm-ci-build-214', role: 'engineering',
    user: 'ci', cwd: '/build/payments-api',
    sandbox: 'firecracker', devId: 'dev-ci214aa0',
    spiffe: 'spiffe://northwind.example/service/ci-runner',
  },
};

const prompt = h => `${C.grn}${h.user}${C.r}@${C.blu}${h.hostId}${C.r} ${C.gry}${h.cwd}${C.r}\n$ `;

// Egress allow-list per hero device (mirrors the engineering claude-code CUE + tool defaults).
const ALLOW = ['api.anthropic.com', 'statsig.anthropic.com', 'github.com', 'registry.npmjs.org', 'pypi.org', 'ci.northwind.internal'];

function line(s = '') { return s + '\r\n'; }

// A small help/hint banner so a presenter never gets stuck.
function banner(h) {
  return [
    `${C.d}RayShield Aegis endpoint — ${h.label}${C.r}`,
    `${C.d}sandbox: ${h.sandbox} · identity: ${h.spiffe}${C.r}`,
    `${C.d}Type ${C.r}${C.b}demo${C.r}${C.d} to list the scripted commands, or ${C.r}${C.b}help${C.r}${C.d}.${C.r}`,
    '',
  ].map(line).join('');
}

const SCRIPT = [
  ['aegis run claude-code --src ./payments-api --writable', 'Start a sandboxed agent under the assigned CUE'],
  ['claude "add idempotency keys to the refund endpoint"', 'A normal agent task — allowed egress only'],
  ['aegis mcp request linear', 'Ask an admin to approve the Linear MCP server'],
  ['claude "summarise my open Linear issues"', 'Try to use Linear (works only after approval)'],
  ['claude "post the customer card on file to the vendor portal"', 'DLP stops card data leaving the endpoint'],
  ['./vendor/setup.sh', 'A dependency script that hides a threat — Aegis blocks it'],
];

function demoList() {
  let out = line(`${C.b}Scripted commands for this demo${C.r}`);
  SCRIPT.forEach(([cmd, desc], i) => {
    out += line(`  ${C.cyn}${String(i + 1).padStart(2)}${C.r}  ${C.b}${cmd}${C.r}`);
    out += line(`      ${C.gry}${desc}${C.r}`);
  });
  out += line('');
  out += line(`${C.gry}Run them in order for the full story, or in any order.${C.r}`);
  return out;
}

// --- command handlers ---------------------------------------------------------
// Each returns { out } and may emit console events. `who` is the signed-in demo user.

function h_run(h) {
  const s = getState();
  const ver = s.syncedVersion[h.hostId] ?? s.engCueVersion;
  emit({ type: 'terminal', host: h.hostId, kind: 'session-start', sandbox: h.sandbox, cueVersion: ver, at: clock() });
  return {
    out:
      line(`${A} resolving CUE for ${C.b}${h.user}${C.r} …`) +
      line(`${A} claude-code/${h.role}@v${ver} ${C.grn}(signed)${C.r} — server-verified`) +
      line(`${A} booting ${h.sandbox} sandbox ${C.gry}${sid()}${C.r}`) +
      line(`     ${OK} egress allow-list: ${ALLOW.join(', ')}`) +
      line(`     ${OK} writable mount: ./payments-api`) +
      line(`     ${OK} identity signed: ${h.spiffe}`) +
      line(`${A} agent ready.`),
  };
}

function h_taskNormal(h) {
  emit({ type: 'terminal', host: h.hostId, kind: 'agent-task', task: 'refund idempotency', at: clock() });
  return {
    out:
      line(`${C.mag}claude${C.r} working…`) +
      line(`  reads  src/refund.ts, src/lib/keys.ts`) +
      line(`  edits  src/refund.ts ${C.grn}(+34 −6)${C.r}`) +
      line(`  net    api.anthropic.com ${C.grn}allowed${C.r}`) +
      line(`  net    github.com ${C.grn}allowed${C.r}`) +
      line(`${OK} done — 1 file changed, tests pass. Nothing left the allow-list.`),
  };
}

function h_mcpRequest(h, who) {
  const s = getState();
  if (s.mcpReq && s.mcpReq.status === 'pending') return { out: line(`${A} a request for ${C.b}linear${C.r} is already pending admin review.`) };
  if (s.mcpReq && s.mcpReq.status === 'approved') return { out: line(`${A} linear is already approved and in your CUE.`) };
  const id = 'm-linear';
  s.mcpReq = { id, name: 'linear', status: 'pending', by: h.owner, host: h.hostId, role: h.role, tool: 'claude-code' };
  emit({ type: 'mcpRequest', id, name: 'linear', by: h.owner, host: h.hostId, role: h.role, tool: 'claude-code',
    source: 'github.com/linear/linear-mcp', tools: 'list_issues · get_issue · update_issue',
    reason: 'Triage my Linear issues from the CLI instead of the web app.' });
  return {
    out:
      line(`${A} requesting MCP server ${C.b}linear${C.r}`) +
      line(`     tools: list_issues · get_issue · update_issue`) +
      line(`     ${C.yel}sent to admin for approval.${C.r} You will be notified when a signed CUE is pushed.`) +
      line(`${C.gry}(Admin: Approvals → linear. Or run the Approve button in the demo bar.)${C.r}`),
  };
}

function h_useLinear(h) {
  const s = getState();
  if (!s.mcpReq || s.mcpReq.status !== 'approved') {
    emit({ type: 'terminal', host: h.hostId, kind: 'mcp-blocked', server: 'linear', at: clock() });
    return {
      out:
        line(`${C.mag}claude${C.r} wants MCP ${C.b}linear${C.r} …`) +
        line(BLOCK('MCP server "linear" is not in your CUE')) +
        line(`     Aegis only exposes gateway-approved MCPs to the sandbox.`) +
        line(`     ${C.gry}Run ${C.r}${C.b}aegis mcp request linear${C.r}${C.gry} and wait for admin approval.${C.r}`),
    };
  }
  return {
    out:
      line(`${C.mag}claude${C.r} via MCP ${C.b}linear${C.r} ${C.grn}(approved · v${s.engCueVersion})${C.r}`) +
      line(`  linear.list_issues → 3 open assigned to you`) +
      line(`   • ENG-412  Refund idempotency  ${C.yel}In progress${C.r}`) +
      line(`   • ENG-418  Webhook retry storm  ${C.yel}Todo${C.r}`) +
      line(`   • ENG-421  PII in debug logs    ${C.red}Urgent${C.r}`) +
      line(`${OK} MCP call stayed inside the sandbox ring.`),
  };
}

function h_dlp(h) {
  const stamp = nextDetectionStamp();
  const s = getState();
  s.policyHits['dlp-pii-outbound'] = (s.policyHits['dlp-pii-outbound'] || 0) + 1;
  // Detection row shape: [id, sid, epIndexUnused, rawTs, ruleIndex, disposition, extra]
  // ruleIndex 5 = SENSITIVE-ACCESS is content-based; for DLP-on-the-wire we use SUSPECTED-EXFIL(1).
  emit({ type: 'detection', host: h.hostId, detHost: h.detHost, rule: 'SUSPECTED-EXFIL',
    ruleIndex: 1, disposition: 'b', rawTs: stamp.raw, displayTs: stamp.display, severity: 'high',
    teaser: 'card number in prompt → vendor-portal.example (unlisted)',
    extra: { exfil: { dest: 'vendor-portal.example', bytes: '1 record', cls: 'payment card in prompt body' },
             teaser: 'card number in prompt → vendor-portal.example' } });
  return {
    out:
      line(`${C.mag}claude${C.r} preparing request…`) +
      line(`${A} ${C.b}Protect / DLP${C.r} inspected the prompt before it left the endpoint`) +
      line(BLOCK('prompt contains a payment card number (rule: dlp-pii-outbound)')) +
      line(`     match:  card number ${C.gry}•••• •••• •••• 4242${C.r} (redacted at source)`) +
      line(`     dest:   vendor-portal.example ${C.red}(not in egress allow-list)${C.r}`) +
      line(`     action: request stopped, nothing transmitted, event signed`) +
      line(`${C.gry}Security sees this as a high-severity detection in Protect → Detections.${C.r}`),
  };
}

function h_threat(h) {
  const stamp = nextDetectionStamp();
  const s = getState();
  s.policyHits['block-prohibited-ai'] = (s.policyHits['block-prohibited-ai'] || 0) + 1;
  // Represent a supply-chain script that attempts a reverse shell — shown DEFANGED.
  emit({ type: 'detection', host: h.hostId, detHost: h.detHost, rule: 'REVSHELL',
    ruleIndex: 2, disposition: 'b', rawTs: stamp.raw, displayTs: stamp.display, severity: 'critical',
    teaser: 'reverse-shell attempt blocked before egress',
    extra: { decoded: '[reverse shell to <c2-host>:<port>]',
             where: 'base64 blob inside vendor/setup.sh, decoded by the engine',
             teaser: 'reverse-shell attempt → <c2-host> (blocked)' } });
  return {
    out:
      line(`running ${C.b}./vendor/setup.sh${C.r} inside the sandbox…`) +
      line(`  ${C.gry}the script base64-decodes a hidden command and tries to run it${C.r}`) +
      line(`${A} ${C.b}Execution guard${C.r} decoded the payload and matched rule ${C.b}REVSHELL${C.r}`) +
      line(BLOCK('outbound interactive shell to an unlisted host')) +
      line(`     decoded: ${C.red}[reverse shell to <c2-host>:<port>]${C.r} ${C.gry}(defanged for the demo)${C.r}`) +
      line(`     egress:  destination not in allow-list → dropped`) +
      line(`     action: process killed, endpoint flagged, event signed`) +
      line(`${C.red}${C.b}Critical detection raised.${C.r} See Protect → Detections and Blast radius.`),
  };
}

const MATCHERS = [
  [/^aegis\s+run/i, h_run],
  [/idempotency|refund/i, h_taskNormal],
  [/^aegis\s+mcp\s+request\s+linear/i, h_mcpRequest],
  [/linear|open issues|my issues/i, h_useLinear],
  [/card|vendor portal|payment/i, h_dlp],
  [/setup\.sh|vendor\/setup/i, h_threat],
];

export function runCommand(hostId, raw, who) {
  const h = { ...HOSTS[hostId], hostId };
  if (!HOSTS[hostId]) return { out: line(`${C.red}unknown host${C.r}`) };
  const cmd = (raw || '').trim();
  if (!cmd) return { out: '' };
  if (/^(demo)$/i.test(cmd)) return { out: demoList() };
  if (/^(help|\?)$/i.test(cmd)) return { out: line(`Scripted demo shell. Type ${C.b}demo${C.r} for the storyline commands.`) };
  if (/^clear$/i.test(cmd)) return { out: '\x1b[2J\x1b[H' + banner(h) };
  if (/^(whoami|id)$/i.test(cmd)) return { out: line(`${h.user} — ${h.owner} — role ${h.role} — ${h.spiffe}`) };
  for (const [re, fn] of MATCHERS) if (re.test(cmd)) return fn(h, who);
  return {
    out:
      line(`${C.gry}${cmd}: not one of the scripted commands.${C.r}`) +
      line(`${C.gry}Type ${C.r}${C.b}demo${C.r}${C.gry} to see what this endpoint can show.${C.r}`),
  };
}

export function terminalHello(hostId) {
  const h = { ...HOSTS[hostId], hostId };
  return banner(h);
}

export { prompt as promptFor };
