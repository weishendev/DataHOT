// CNY list prices checked against https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ (2026-10-23).
// Reserve peak, uncached prices even when the provider bills less. Prices must cover every chosen model.
export { RADAR_WATCHLIST } from '@aihot/industry/data-demand';
export const DATA_DEMAND = {
  monthlyBudgetCny: 10,
  maxCandidates: 230,
  radarCandidates: 30,
  radarLookbackDays: 14,
  prices: {
    'deepseek-flash': { input: 2, output: 8 },
    'deepseek-v4-pro': { input: 9, output: 27 },
  } as Record<string, { input: number; output: number }>,
};
