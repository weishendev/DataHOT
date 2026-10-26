import { DATA_DEMAND } from '@aihot/site/data-demand';
import { beijingDate } from '@aihot/contracts/time';
import { sql } from '@aihot/backend/db';
import { MODELS } from '@aihot/backend/providers/llm';
import { ProviderRejectedError } from '@aihot/backend/providers/receipts';

export class DemandBudgetError extends ProviderRejectedError {
  constructor(message: string) { super(message, null, false); }
}

// A UTF-8 byte per input token plus message overhead is a conservative upper bound for these
// byte-based tokenizers. Charge the whole output allowance, including reasoning, before each send.
export function callAllowance(model: string, system: string, user: string, maxTokens: number): number {
  const spec = MODELS[model];
  const price = spec && DATA_DEMAND.prices[spec.model];
  if (!price || spec.service !== 'deepseek') throw new DemandBudgetError('数据需求分析未配置所选模型的人民币单价；请先更新 site/data-demand.ts');
  const input = Buffer.byteLength(system + user, 'utf8') + 4096;
  return Math.ceil((input * price.input + (maxTokens + (spec.reasoningTokens ?? 0)) * price.output) / 1e6 * 1e6) / 1e6;
}

export async function reserveBudget(amount: number, now = new Date()): Promise<void> {
  const limit = DATA_DEMAND.monthlyBudgetCny;
  if (!Number.isFinite(amount) || amount <= 0 || amount > limit) throw new DemandBudgetError('数据需求分析的单次请求超出月度预算');
  const month = beijingDate(now).slice(0, 7);
  // The conditional upsert is atomic across worker and manual runs. Reservations are deliberately
  // not refunded: timeouts and malformed answers may still have been billed by the provider.
  const rows = await sql`INSERT INTO data_demand_budget (month, reserved_cny, calls) VALUES (${month}, ${amount}, 1)
    ON CONFLICT (month) DO UPDATE SET reserved_cny = data_demand_budget.reserved_cny + ${amount}, calls = data_demand_budget.calls + 1
    WHERE data_demand_budget.reserved_cny + ${amount} <= ${limit} RETURNING month`;
  if (!rows.length) throw new DemandBudgetError(`数据需求分析 ${month} 已达到 ${limit} 元月度预留上限`);
}
