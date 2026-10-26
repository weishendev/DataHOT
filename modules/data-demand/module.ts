import { defineModule } from '@aihot/contracts/modules';

export default defineModule({
  name: 'data-demand',
  pages: [
    { path: 'data-demand', file: 'web/page.tsx', id: 'data-demand-latest' },
    { path: 'data-demand/:key', file: 'web/page.tsx', id: 'data-demand-detail' },
  ],
});
