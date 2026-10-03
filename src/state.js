// Shared demo state. Phase 1 keeps it in memory: one Railway instance, one demo tenant ("Northwind Capital").
// Phase B swaps this module for Postgres + events reported by real agents; the event shapes stay the same.
import crypto from 'node:crypto';

const listeners = new Set();
let state;
let persistFn = null; // set by the bank tenant to save state to JSON; Northwind stays in memory

export function setPersist(fn) { persistFn = fn; }
export function persist() { if (persistFn) persistFn(); }

export function resetState() {
  state = {
    epoch: crypto.randomBytes(4).toString('hex'),
    events: [],          // everything the console needs to replay, in order
    detCount: 0,         // scripted detections so far (drives their timestamps)
    clockTick: 0,        // terminal clock ticks
    mcpReq: null,        // the developer's Linear MCP request { id, status, by }
    engCueVersion: 7,    // claude-code/engineering CUE version on the server
    syncedVersion: { 'LT-4821': 7, 'vm-ci-build-214': 7 }, // version each hero device runs
    policyHits: {},      // policy name -> extra hits since reset
    bank: freshBankState(), // Straits Meridian tenant only (ignored by Northwind)
  };
  broadcast({ type: 'reset', epoch: state.epoch });
  persist();
}

// Restore a saved snapshot (bank tenant, from live-state.json) on server start.
export function loadState(saved) {
  if (!saved || !saved.bank) return false;
  state.epoch = saved.epoch || state.epoch;
  state.events = Array.isArray(saved.events) ? saved.events : [];
  state.bank = { ...freshBankState(), ...saved.bank };
  return true;
}

// Broadcast without recording in the replay log (large console-state updates).
export function notify(evt) { broadcast({ id: crypto.randomBytes(6).toString('hex'), at: Date.now(), ...evt }); }

export const getState = () => state;

// Straits Meridian demo state: overlays applied on top of canonical.json by the API builder.
function freshBankState() {
  return {
    serviceStatus: {},        // service_id -> { status, reviewed_by, reviewed_at }
    bridge: {},               // bridge id -> patch (status, approved_by, …)
    groupPolicy: {},          // group id -> { mcp_allow, mcp_deny, policy_updated_by }
    payCueVersion: 3,         // Payments CUE; 4 once the v4 draft is published
    payCuePublishedBy: null, payCuePublishedAt: null,
    myRequests: [],           // developer MCP requests from the terminal / me page
    extraDetections: [],      // detections raised live by the terminal
    liveN: 0,                 // live detections so far (drives their timestamps)
    syncedVersion: { 'LT-SG-2231': 3, 'vm-dev-rahul-07': 3 },
    sandbox: {},              // host -> true once `aegis run` booted a sandbox
    transcript: {},           // host -> [{cmd, out}] for Security's read-only replay
    rahulSpendExtra: 0,
    slices: {},               // console edits saved by the server (groups, policies, CUEs, settings, device groups)
    apiGroups: [],            // groups created through the API
    createdCues: [], deletedCues: [], cueEdits: {}, groupCue: {}, removedBridge: [], newBridge: [],
    workflows: null,          // approval requests (src/workflows.js seeds them on first use)
    notices: [],              // inbox notices: who was told what, and who has read it
    budgetExceptions: {},
    mcpGrants: {},            // groupId -> mcpName -> { expires_at, granted_by } (time-limited MCP access)     // uid -> { cap_usd, approved_by, until } granted through an approval
  };
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function broadcast(evt) { for (const fn of listeners) { try { fn(evt); } catch { /* client gone */ } } }

export function emit(evt, delayMs = 0) {
  const full = { id: crypto.randomBytes(6).toString('hex'), at: Date.now(), ...evt };
  const fire = () => { state.events.push(full); broadcast(full); persist(); };
  if (delayMs > 0) { const epoch = state.epoch; setTimeout(() => { if (state.epoch === epoch) fire(); }, delayMs); } else fire();
  return full;
}

// The prototype's clock is frozen at 24 Sep 2026 14:02 (raw data frame 29 Sep 20:30).
// Scripted detections land in the two minutes before "now" so they sort to the top.
export function nextDetectionStamp() {
  const k = Math.min(state.detCount, 5);
  state.detCount++;
  const off = k * 20;                       // 0..100 s after 20:28:00 raw (= 14:00:00 displayed)
  const p = n => String(n).padStart(2, '0');
  const m = Math.floor(off / 60), s = off % 60;
  return { raw: `09-29T20:${p(28 + m)}:${p(s)}`, display: `14:${p(m)}:${p(s)}` };
}

// Terminal clock in the same frozen frame: starts 13:59:00 and moves forward a few seconds per command.
export function clock() {
  state.clockTick += 7;
  const t = 13 * 3600 + 59 * 60 + Math.min(state.clockTick, 170);
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
}

resetState();
