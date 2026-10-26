// One-off catch-up using collected materials; shares receipts and the monthly budget with the worker.
import { closeDb } from '@aihot/backend/db';
import { installModules } from '@aihot/backend/modules';
import server from '../server.ts';
import { composeDemandWeek, dueWeek } from '../backend/compose.ts';

installModules([server]);
try { console.log(await composeDemandWeek(process.argv[2] ?? dueWeek(new Date()))); }
finally { await closeDb(); }
