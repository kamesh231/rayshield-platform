// Entry point. DEMO_TENANT=fleet runs the console on real Fleet data (src/live/server.js);
// every other value runs the scripted demo (src/server.js) exactly as before.
const tenant = (process.env.DEMO_TENANT || 'northwind').toLowerCase();
await import(tenant === 'fleet' ? './live/server.js' : './server.js');
