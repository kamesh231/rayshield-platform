// Playwright check for the Straits Meridian tenant (fictional).
// Needs a running server: DEMO_TENANT=straits-meridian npm start   (BASE defaults to http://localhost:3000)
//   node scripts/shots-bank.mjs          → screenshots design/bank-shot-*.png (landing + one key screen per persona)
//   CRAWL=1 node scripts/shots-bank.mjs  → also opens every sidebar screen per persona and reports page errors
// Uses the system Chrome (channel 'chrome'); set PW_CHANNEL= to use Playwright's bundled Chromium instead.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:3000';
const CRAWL = !!process.env.CRAWL;
const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : (process.env.PW_CHANNEL || undefined);
const shot = n => path.join(root, 'design', `bank-shot-${n}.png`);
const saved = [], problems = [];

const browser = await chromium.launch({ channel });
async function session(login) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /renderVals|eval FAILED|TypeError|ReferenceError/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const r = await page.request.post(BASE + '/api/login', { data: { username: login, password: 'demo' } });
  if (!r.ok()) throw new Error('login failed for ' + login);
  return { ctx, page, errs };
}
const settle = p => p.waitForTimeout(700);
const nav = async (page, top, sub) => {
  await page.locator('aside button').filter({ hasText: new RegExp('^\\s*' + top) }).first().click(); await settle(page);
  if (sub) { await page.locator('aside button').filter({ hasText: new RegExp('^\\s*' + sub) }).first().click(); await settle(page); }
};
const save = async (page, n, full = false) => { await page.screenshot({ path: shot(n), fullPage: full }); saved.push(path.relative(root, shot(n))); };
const renderErr = async page => (await page.locator('text=/renderVals\\(\\)|Cannot read properties/').count()) > 0;

async function crawl(login, page, errs) {
  const tops = ['Home', 'Discover', 'Control', 'Protect', 'Usage', 'Settings'];
  for (const top of tops) {
    try { await nav(page, top); } catch (e) { problems.push(`${login} · ${top}: could not open (${e.message.split('\n')[0]})`); continue; }
    const subs = await page.locator('aside button').evaluateAll(bs => bs.map(b => b.innerText.trim().split('\n')[0].trim()).filter(t => t && !/ · /.test(t)));
    for (const sub of [null, ...subs.filter(s => !/^(Home|Discover|Control|Protect|Usage|Settings|Sign out)$/.test(s))]) {
      if (sub) { try { await page.locator('aside button').filter({ hasText: new RegExp('^\\s*' + sub.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')) }).first().click({ timeout: 2000 }); await settle(page); } catch { continue; } }
      if (process.env.VERBOSE) console.error('  crawl', login, top, sub || '');
      if (await renderErr(page) || errs.length) problems.push(`${login} · ${top}${sub ? ' → ' + sub : ''}: ${errs.splice(0).join(' | ') || 'render error banner'}`);
    }
  }
}

// ---- Admin: landing + Fleet (CUE drift, offline agents)
{ const { ctx, page, errs } = await session('weiling');
  await page.goto(BASE + '/console'); await settle(page); await save(page, 'admin-home', true);
  await nav(page, 'Protect', 'Fleet'); await save(page, 'admin-fleet');
  if (CRAWL) await crawl('weiling', page, errs); else if (errs.length) problems.push('weiling: ' + errs.join(' | '));
  await ctx.close(); }

// ---- Security: landing + the hero detection (evidence, signature) + blast radius tree
{ const { ctx, page, errs } = await session('arjun');
  await page.goto(BASE + '/console'); await settle(page); await save(page, 'security-home', true);
  await page.getByText('det_01JA4K9PAN1').first().click(); await settle(page); await save(page, 'security-detection', true);
  await nav(page, 'Protect', 'Blast radius'); await page.getByText('Rahul Iyer').first().click(); await settle(page); await save(page, 'security-blast-radius');
  // the blast-radius tree opens full-screen (sidebar hidden by design) — reload before crawling
  if (CRAWL) { await page.goto(BASE + '/console'); await settle(page); await crawl('arjun', page, errs); } else if (errs.length) problems.push('arjun: ' + errs.join(' | '));
  await ctx.close(); }

// ---- CISO: exec landing + MCP Bridge (confluence awaiting decision) + redacted detection
{ const { ctx, page, errs } = await session('priscilla');
  await page.goto(BASE + '/console'); await settle(page); await save(page, 'ciso-home', true);
  await nav(page, 'Control', 'MCP Bridge'); await save(page, 'ciso-mcp-bridge', true);
  if (CRAWL) await crawl('priscilla', page, errs); else if (errs.length) problems.push('priscilla: ' + errs.join(' | '));
  await ctx.close(); }

// ---- Developer: /me landing + terminal after the settlement task is blocked
{ const { ctx, page, errs } = await session('rahul');
  await page.request.post(BASE + '/api/terminal/exec', { data: { host: 'LT-SG-2231', cmd: 'aegis run claude-code --src ./settlement-recon --writable' } });
  await page.goto(BASE + '/me'); await page.waitForTimeout(1200); await save(page, 'developer-me', true);
  await page.goto(BASE + '/terminal'); await page.waitForTimeout(1200);
  await page.locator('#term').click();
  await page.keyboard.type('claude "find why yesterday\'s card settlement is off by SGD 1,240"'); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500); await save(page, 'developer-terminal');
  if (errs.length) problems.push('rahul: ' + errs.join(' | '));
  await ctx.close(); }

await browser.close();
console.log('screenshots:\n  ' + saved.join('\n  '));
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'no page errors' + (CRAWL ? ' on any crawled screen' : ''));
process.exit(problems.length ? 1 : 0);
