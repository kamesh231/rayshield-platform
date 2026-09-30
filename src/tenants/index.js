// Loads the demo tenant chosen by DEMO_TENANT (northwind default | straits-meridian) from
// data/tenants/<id>/ and exports its users (with perms), terminal hosts and, for the bank tenant,
// the canonical data, access matrix, console seed and API builder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeApi } from '../../scripts/lib/tenant-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TENANT = (process.env.DEMO_TENANT || 'northwind').toLowerCase();
if (!['northwind', 'straits-meridian'].includes(TENANT)) throw new Error(`Unknown DEMO_TENANT "${TENANT}" (use northwind or straits-meridian)`);
const dir = path.join(root, 'data/tenants', TENANT);
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const IS_BANK = TENANT === 'straits-meridian';
export const tenant = read('tenant.json');

let users, bank = null;
if (!IS_BANK) {
  users = read('users.json').users;
} else {
  const personas = read('personas.json').personas;
  const matrix = read('access-matrix.json');
  const canonical = read('canonical.json');
  const seed = read('console-seed.json');
  // who holds each permission — used in "only X can do this" messages
  const holders = {};
  for (const p of Object.values(personas)) for (const [k, v] of Object.entries(p.perms)) if (v === true) (holders[k] = holders[k] || []).push(`${p.name} (${p.console === 'Administrator' && p.role_claim === 'ciso' ? 'CISO' : p.role_claim === 'admin' ? 'Admin' : p.role_claim === 'security' ? 'Security' : p.role_claim})`);
  users = Object.fromEntries(Object.entries(personas).map(([id, p]) => [id, {
    name: p.name, email: p.email, password: p.password, title: p.title, console: p.console, landing: p.landing,
    roleClaim: p.role_claim, perms: p.perms, home: p.home, demoBar: p.demo_bar, scope: p.data_scope,
  }]));
  bank = { personas, matrix, canonical, seed, holders, api: makeApi(canonical, personas, matrix) };
}
export const USERS = users;
export const BANK = bank;
export const HOSTS_LIST = IS_BANK ? ['LT-SG-2231', 'vm-dev-rahul-07'] : tenant.hosts;
