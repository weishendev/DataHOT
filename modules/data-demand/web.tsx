import type { WebModule } from '@aihot/web/modules';
import { IconDoc } from '@aihot/web/components/icons';

const entry = { to: '/data-demand', label: '数据需求分析周报', icon: IconDoc };
export default {
  name: 'data-demand',
  sidebar: { section: '内容', items: [entry] },
  tools: [{ to: entry.to, label: entry.label, icon: <IconDoc size={20} /> }],
} satisfies WebModule;
