import { z } from 'zod';
import type { Family, Signal, TypeGroup } from '../contracts.ts';
import { FAMILIES } from '../contracts.ts';

export interface Material {
  id: string; revision: number; fact_key: string; title: string; summary: string; material: string;
}
const SignalSchema = z.object({
  family: z.enum(Object.keys(FAMILIES) as [Family, ...Family[]]),
  typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/), dataType: z.string().min(2).max(50),
  task: z.string().min(2).max(180), kind: z.enum(['explicit', 'inferred', 'supply']),
  organizations: z.array(z.string().min(1).max(80)).max(5), services: z.array(z.enum(['sourcing', 'annotation', 'evaluation'])).max(3),
  // Real responses can quote a full English sentence despite the requested limit. Keep a
  // continuous short excerpt locally, then verify it literally against the supplied material.
  evidence: z.string().min(12).max(2000).transform((s) => s.slice(0, 180)), implication: z.string().min(4).max(500), action: z.string().min(4).max(300),
});
export const ExtractionSchema = z.object({ articles: z.array(z.object({ articleId: z.string(), signals: z.array(SignalSchema).max(2) })).max(8) });
export const FindingsSchema = z.object({ findings: z.array(z.object({ title: z.string().min(2).max(70), analysis: z.string().min(4).max(700), signalIds: z.array(z.string()).min(1).max(30) })).max(5) });

export function validateExtraction(materials: Material[], output: z.infer<typeof ExtractionSchema>, known: Signal[]) {
  const byId = new Map(output.articles.map((a) => [a.articleId, a]));
  if (byId.size !== materials.length || output.articles.length !== materials.length || output.articles.some((a) => !materials.some((m) => m.id === a.articleId))) {
    throw new Error('数据需求抽取未完整覆盖输入文章');
  }
  const names = new Map(known.map((s) => [s.dataType.replace(/\s/g, '').toLowerCase(), s]));
  const keys = new Map(known.map((s) => [s.typeKey, s]));
  return materials.map((m) => {
    const text = `${m.title}\n${m.summary}\n${m.material}`;
    let rejected = 0;
    const signals: Signal[] = [];
    for (const [i, item] of byId.get(m.id)!.signals.entries()) {
      if (!text.includes(item.evidence)) { rejected++; continue; }
      const canonical = keys.get(item.typeKey) ?? names.get(item.dataType.replace(/\s/g, '').toLowerCase());
      const kind = item.kind === 'explicit' && !/采购|招标|征集|寻求|招募|looking for|seek|request for|procurement|tender|call for/i.test(item.evidence) ? 'inferred' : item.kind;
      const signal: Signal = { ...item, kind, ...(canonical ? { typeKey: canonical.typeKey, dataType: canonical.dataType, family: canonical.family } : {}),
        organizations: item.organizations.filter((org) => text.toLowerCase().includes(org.toLowerCase())),
        id: `${m.id}:${i}`, articleId: m.id, revision: m.revision, factKey: m.fact_key };
      signals.push(signal);
      keys.set(signal.typeKey, signal);
      names.set(signal.dataType.replace(/\s/g, '').toLowerCase(), signal);
    }
    return { material: m, signals, rejected };
  });
}

export function groupSignals(signals: Signal[], previous: Signal[] | null, known: Signal[]): TypeGroup[] {
  const keys = [...new Set(signals.map((s) => s.typeKey))];
  return keys.map((typeKey) => {
    const rows = signals.filter((s) => s.typeKey === typeKey);
    const count = new Set(rows.map((s) => s.factKey)).size;
    const previousCount = previous === null ? null : new Set(previous.filter((s) => s.typeKey === typeKey).map((s) => s.factKey)).size;
    const change: TypeGroup['change'] = previousCount === null ? 'baseline' : !known.some((s) => s.typeKey === typeKey) ? 'new' : count > previousCount ? 'up' : count < previousCount ? 'down' : 'same';
    return { typeKey, dataType: rows[0]!.dataType, family: rows[0]!.family, count, previousCount, change, signalIds: rows.map((s) => s.id) };
  }).sort((a, b) => b.count - a.count || a.typeKey.localeCompare(b.typeKey));
}
