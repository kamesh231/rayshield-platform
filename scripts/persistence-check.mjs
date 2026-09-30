// Checks that console and API changes are saved to data/tenants/straits-meridian/live-state.json and
// survive sign-out and a server restart (Straits Meridian tenant, fictional).
//   PHASE=write  BASE=http://localhost:3000 node scripts/persistence-check.mjs   (resets, makes changes, signs out and in)
//   … restart the server …
//   PHASE=verify BASE=http://localhost:3000 node scripts/persistence-check.mjs   (checks the changes are still there)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:3000';
const PHASE = process.env.PHASE || 'write';
const LIVE = path.join(root, 'data/tenants/straits-meridian/live-state.json');
const NEW_GROUP = 'Fraud Analytics', API_GROUP = 'Card Operations (API)';
const out = []; let bad = 0;
const check = (ok, label) => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) bad++; };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL === undefined ? 'chrome' : (process.env.PW_CHANNEL || undefined) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
const signIn = async (u) => { await page.goto(BASE + '/login'); await page.fill('#u', u); await page.fill('#p', 'demo'); await page.click('button.go'); await page.waitForURL(/\/(console|me)/); await page.waitForTimeout(1500); };
const signOut = async () => { await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL(/\/login/); };
const nav = async (top, sub) => { await page.locator('aside button').filter({ hasText: new RegExp('^\\s*' + top) }).first().click(); await page.waitForTimeout(400); if (sub) { await page.locator('aside button').filter({ hasText: new RegExp('^\\s*' + sub) }).first().click(); await page.waitForTimeout(500); } };
const main = () => page.locator('main').innerText();
const apiAs = async (u, method, url, body) => { const c = await browser.newContext(); await c.request.post(BASE + '/api/login', { data: { username: u, password: 'demo' } }); const r = await c.request.fetch(BASE + url, { method, data: body }); const j = await r.json().catch(() => null); await c.close(); return { status: r.status(), body: j }; };
const groupActive = async name => (await apiAs('weiling', 'GET', '/api/console/state')).body.slices.roles?.find(r => r.name === name)?.active;

if (PHASE === 'write') {
  check((await apiAs('weiling', 'POST', '/api/demo/reset')).status === 200, 'reset to the seed');
  await signIn('weiling');
  // create a group in the console
  await nav('Control', 'Groups');
  await page.getByRole('button', { name: /New group/i }).first().click();
  await page.getByPlaceholder('e.g. Support · Tier 2').fill(NEW_GROUP);
  await page.getByRole('button', { name: 'Create group', exact: true }).click(); await page.waitForTimeout(1500);
  const cs = (await apiAs('weiling', 'GET', '/api/console/state')).body;
  check(!!cs.slices.roles?.some(r => r.name === NEW_GROUP), `Admin creates group "${NEW_GROUP}" in the console → saved by the server`);
  // edit a seeded group: deactivate Treasury & Markets
  await page.locator('main').getByText('Treasury & Markets', { exact: true }).first().click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Deactivate group' }).click(); await page.waitForTimeout(1500);
  check((await groupActive('Treasury & Markets')) === false, 'Admin deactivates "Treasury & Markets" → saved');
  check(fs.existsSync(LIVE) && JSON.parse(fs.readFileSync(LIVE, 'utf8')).bank.slices.roles.some(r => r.name === NEW_GROUP), 'change is in data/tenants/straits-meridian/live-state.json');
  // sign out and back in through the login form
  await signOut(); check(page.url().endsWith('/login'), 'Sign out → back on the sign-in page');
  await signIn('weiling'); await nav('Control', 'Groups');
  check((await main()).includes(NEW_GROUP), `after signing in again, "${NEW_GROUP}" is still listed`);
  await signOut();
  // Security may not change groups: the server refuses and the console rolls back
  await signIn('arjun'); await nav('Control', 'Groups');
  await page.locator('main').getByText('Retail Banking Operations', { exact: true }).first().click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Deactivate group' }).click(); await page.waitForTimeout(1800);
  const toast = await page.locator('[role=status]').innerText().catch(() => '');
  check(/Only .* can change groups/.test(toast), `Security's edit refused: "${toast.slice(0, 90)}"`);
  check((await groupActive('Retail Banking Operations')) !== false && (await page.getByRole('button', { name: 'Deactivate group' }).count()) === 1, 'console rolled back — Retail Banking Operations still active');
  await signOut();
  // an API write is saved too
  const g = await apiAs('weiling', 'POST', '/api/control/groups', { name: API_GROUP });
  check(g.status === 200, `API createGroup "${API_GROUP}" → 200`);
  check((await apiAs('arjun', 'GET', '/api/control/groups')).body.some(x => x.name === API_GROUP), 'API listGroups shows it');
  out.push('\nNow restart the server, then run with PHASE=verify.');
} else {
  check(fs.existsSync(LIVE), 'live-state.json exists after restart');
  const cs = (await apiAs('weiling', 'GET', '/api/console/state')).body;
  check(!!cs.slices.roles?.some(r => r.name === NEW_GROUP), `console change "${NEW_GROUP}" restored after restart`);
  check((await groupActive('Treasury & Markets')) === false, '"Treasury & Markets" still deactivated after restart');
  check((await apiAs('priscilla', 'GET', '/api/control/groups')).body.some(x => x.name === API_GROUP), `API change "${API_GROUP}" restored after restart`);
  await signIn('priscilla'); await nav('Control', 'Groups');
  const txt = await main();
  check(txt.includes(NEW_GROUP), `CISO's console shows "${NEW_GROUP}" after restart`);
  await signOut();
}
await browser.close();
console.log(out.join('\n')); console.log(`\n${bad ? bad + ' FAILED' : 'PERSISTENCE ' + PHASE.toUpperCase() + ' OK'}`);
process.exit(bad ? 1 : 0);
