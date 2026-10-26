import { closeDb } from '@aihot/backend/db';
import { seedRadarSources, scanDueRadar, scanRadarSource } from '../backend/radar.ts';

try {
  console.log(await seedRadarSources());
  console.log(process.argv[2] ? await scanRadarSource(process.argv[2]) : await scanDueRadar());
} finally { await closeDb(); }
