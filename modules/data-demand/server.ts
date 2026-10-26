import { config } from '@aihot/backend/config';
import { defineServerModule } from '@aihot/backend/modules';
import { composeDueDemand } from './backend/compose.ts';
import { demandPublication } from './backend/publication.ts';
import { radarCollectionEnabled, scanDueRadar, scanRadarSource } from './backend/radar.ts';

export default defineServerModule({
  name: 'data-demand',
  publication: demandPublication,
  models: {
    dataDemandExtract: { label: '数据需求信号抽取', env: 'DATA_DEMAND_EXTRACT_MODEL', purposes: ['data_demand_extract'] },
    dataDemandReport: { label: '数据需求分析周报', env: 'DATA_DEMAND_REPORT_MODEL', purposes: ['data_demand_report'] },
  },
  schedules: [
    { name: 'data-demand.compose', cron: '0,30 * * * *', missed: 'once', when: () => config.modelCallsEnabled, run: () => composeDueDemand() },
    { name: 'data-demand.scan', cron: '*/5 * * * *', missed: 'once', when: radarCollectionEnabled, run: () => scanDueRadar() },
  ],
  sourceKinds: { external: { fetchNow: (source) => scanRadarSource(source.id) } },
  sitemap: { pages: [{ loc: '/data-demand', changefreq: 'weekly' }] },
  llms: () => ({ pages: ['/data-demand — 数据需求分析周报：数据采购、标注交付与评测服务的需求信号。'] }),
});
