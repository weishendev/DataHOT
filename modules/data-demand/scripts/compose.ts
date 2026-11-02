// One-off catch-up using collected materials; shares receipts and the monthly budget with the worker.
import { closeDb } from '@aihot/backend/db';
import { installModules } from '@aihot/backend/modules';
import server from '../server.ts';
import { composeDemandWeek, dueWeek } from '../backend/compose.ts';

installModules([server]);
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const key = args.find((arg) => arg !== '--refresh') ?? dueWeek(new Date());
try { console.log(await composeDemandWeek(key, new Date(), { refresh })); }
finally { await closeDb(); }
