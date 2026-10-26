export const FAMILIES = {
  rlhf_preference: '偏好数据', reward_model: '奖励模型', sft_instruction: '指令数据', code: '代码数据',
  agent_tool: 'Agent 轨迹', robotics: '机器人', rl_environment: 'RL 环境', synthetic: '合成数据',
  multimodal: '多模态', multilingual: '多语言', evaluation: '评测数据', other: '其他新类型',
} as const;
export type Family = keyof typeof FAMILIES;
export const SERVICES = { sourcing: '数据采购', annotation: '标注交付', evaluation: '评测服务' } as const;
export const KINDS = { explicit: '明确需求', inferred: '潜在需求', supply: '供给信号' } as const;

export interface Signal {
  id: string;
  articleId: string;
  revision: number;
  factKey: string;
  family: Family;
  typeKey: string;
  dataType: string;
  task: string;
  kind: keyof typeof KINDS;
  organizations: string[];
  services: Array<keyof typeof SERVICES>;
  evidence: string;
  implication: string;
  action: string;
}
export interface Finding { title: string; analysis: string; signalIds: string[] }
export interface TypeGroup {
  typeKey: string;
  dataType: string;
  family: Family;
  count: number;
  previousCount: number | null;
  change: 'baseline' | 'new' | 'up' | 'same' | 'down';
  signalIds: string[];
}
export interface Issue {
  key: string;
  start: string;
  end: string;
  generatedAt: string;
  signals: Signal[];
  findings: Finding[];
  groups: TypeGroup[];
  previousKey: string | null;
  stats: { available: number; analysed: number; rejected: number; limited: boolean };
}
export interface Citation { id: string; title: string; url: string; sourceName: string; publishedAt: string }
export interface DemandPage {
  index: Array<{ key: string; start: string; end: string }>;
  report: (Issue & { citations: Citation[]; removed: number }) | null;
}
