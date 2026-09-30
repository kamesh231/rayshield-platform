// Demo logins for the active tenant (DEMO_TENANT). Data lives in data/tenants/<id>/;
// see src/tenants/index.js. `perms` is enforced server-side in src/server.js.
import { USERS } from './tenants/index.js';

export { USERS };

export const publicUser = (id) => {
  const u = USERS[id];
  if (!u) return null;
  const { password, ...rest } = u;
  return { id, ...rest };
};
