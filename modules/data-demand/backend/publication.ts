import { sql } from '@aihot/backend/db';
import type { ModulePublication, PublicCitation } from '@aihot/backend/publication/module-pages';
import { isoWeekRange } from '@aihot/contracts/time';
import type { DemandPage, Issue } from '../contracts.ts';

export async function demandPublication(key: string | null): Promise<ModulePublication | null> {
  if (key !== null && !isoWeekRange(key)) return null;
  const index = await sql<{ key: string; content: Issue }[]>`SELECT key, content FROM data_demand_reports ORDER BY key DESC LIMIT 104`;
  const selected = key === null ? index[0] : index.find((r) => r.key === key);
  // A permanent issue older than the directory's limit remains readable at its address.
  const issue = selected ?? (key ? (await sql<{ key: string; content: Issue }[]>`SELECT key, content FROM data_demand_reports WHERE key = ${key}`)[0] : null);
  if (key !== null && !issue) return null;
  const history = issue ? await sql<{ content: Issue }[]>`SELECT content FROM data_demand_reports WHERE key < ${issue.key} ORDER BY key DESC LIMIT 8` : [];
  return {
    citationIds: [...(issue?.content.signals.map((s) => s.articleId) ?? []), ...history.flatMap((h) => h.content.signals.map((s) => s.articleId))],
    present(citations: ReadonlyMap<string, PublicCitation>): DemandPage {
      const report = issue?.content;
      const signals = report?.signals.filter((s) => citations.get(s.articleId)?.revision === s.revision) ?? [];
      const ids = new Set(signals.map((s) => s.id));
      const historyChanged = history.some((h) => h.content.signals.some((s) => citations.get(s.articleId)?.revision !== s.revision));
      const groups = report?.groups.flatMap((g) => {
        const current = signals.filter((s) => g.signalIds.includes(s.id));
        return current.length ? [{ ...g, count: new Set(current.map((s) => s.factKey)).size, signalIds: current.map((s) => s.id),
          // Citation changes invalidate the frozen comparison as well as prose.
          ...(current.length < g.signalIds.length || historyChanged ? { change: 'baseline' as const, previousCount: null } : {}) }] : [];
      }) ?? [];
      return { index: index.map((i) => ({ key: i.key, start: i.content.start, end: i.content.end })),
        report: report ? { ...report, signals, groups,
          previousKey: historyChanged ? null : report.previousKey,
          findings: historyChanged ? [] : report.findings.filter((f) => f.signalIds.every((id) => ids.has(id))),
          citations: [...new Set(signals.map((s) => s.articleId))].map((id) => citations.get(id)!),
          removed: report.signals.length - signals.length } : null };
    },
  };
}
