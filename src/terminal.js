// Scripted endpoint terminals for the active tenant. Northwind's script is unchanged
// (src/terminals/northwind.js); the bank tenant has its own hosts and storyline.
import { IS_BANK } from './tenants/index.js';
import * as northwind from './terminals/northwind.js';
import * as bank from './terminals/straits-meridian.js';

const T = IS_BANK ? bank : northwind;
export const HOSTS = T.HOSTS;
export const runCommand = T.runCommand;
export const terminalHello = T.terminalHello;
export const promptFor = T.promptFor;
