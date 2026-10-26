import { DATA_DEMAND } from '@aihot/site/data-demand';
import { addDays, beijingAt, beijingDate, beijingMidnight, isoWeekLabel, isoWeekRange } from '@aihot/contracts/time';
import { sql } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
import { sha256, stableJson } from '@aihot/backend/lib/ids';
import { modelFor } from '@aihot/backend/editorial/models';
import { chatJson } from '@aihot/backend/providers/llm';
import { completeReceipt, rejectReceivedResponse } from '@aihot/backend/providers/receipts';
import { listedCondition } from '@aihot/backend/publication/scope';
import { publicCitations } from '@aihot/backend/publication/module-pages';
import type { Issue, Signal } from '../contracts.ts';
import { ExtractionSchema, FindingsSchema, groupSignals, validateExtraction, type Material } from './analysis.ts';
import { EXTRACT_PROMPT, REPORT_PROMPT } from './prompts.ts';
import { callAllowance, reserveBudget } from './budget.ts';

export const EXTRACT_VERSION = sha256(EXTRACT_PROMPT);
const REPORT_VERSION = sha256(REPORT_PROMPT);

export function dueWeek(now: Date): string {
  const today = beijingDate(now);
  const monday = isoWeekRange(isoWeekLabel(today))!.start;
  return isoWeekLabel(addDays(monday, now < beijingAt(monday, '08:00') ? -8 : -1));
}

async function candidates(start: Date, end: Date, now: Date) {
  const rows = await sql<(Material & { total: number })[]>`
    WITH ranked AS (
      SELECT p.article_id AS id, p.revision, coalesce('fact:' || p.fact_id::text, 'article:' || p.article_id) AS fact_key,
        p.title, coalesce(p.summary, '') AS summary, left(coalesce(a.body_text, ''), 1600) AS material,
        p.score, p.published_at, (a.raw->>'radarAsset' IS NOT NULL) AS radar,
        row_number() OVER (PARTITION BY coalesce('fact:' || p.fact_id::text, 'article:' || p.article_id)
          ORDER BY (s.tier = 'T1') DESC, p.score DESC NULLS LAST, p.article_id) AS representative
      FROM publications p JOIN articles a ON a.id = p.article_id JOIN sources s ON s.id = p.source_id
      WHERE ${listedCondition(now)} AND coalesce(p.published_at, p.discovered_at) >= ${start}
        AND coalesce(p.published_at, p.discovered_at) < ${end}
        AND coalesce(p.summary, '') <> ''
    ), pool AS (
      SELECT *, count(*) OVER ()::int AS total,
        row_number() OVER (PARTITION BY radar ORDER BY score DESC NULLS LAST, published_at DESC, id) AS channel_rank
      FROM ranked WHERE representative = 1
    ) SELECT * FROM pool
      ORDER BY (radar AND channel_rank <= ${DATA_DEMAND.radarCandidates}) DESC, score DESC NULLS LAST, published_at DESC, id LIMIT ${DATA_DEMAND.maxCandidates}`;
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function composeDemandWeek(key: string, now = new Date()) {
  const range = isoWeekRange(key);
  if (!range) throw new Error('invalid ISO week');
  const endDate = addDays(range.end, 1);
  if (now < beijingAt(endDate, '08:00')) throw new Error('数据需求周报尚未到出刊时间');
  const [saved] = await sql`SELECT key FROM data_demand_reports WHERE key = ${key}`;
  if (saved) return { key, status: 'exists' };
  if (!config.modelCallsEnabled) return { key, status: 'disabled' };
  const start = beijingMidnight(range.start);
  const end = beijingMidnight(endDate);
  const input = await candidates(start, end, now);
  if (!input.total) return { key, status: 'waiting', reason: '本期窗口内尚无已完成分析的公开材料' };

  const history = await sql<{ key: string; content: Issue }[]>`SELECT key, content FROM data_demand_reports
    WHERE key < ${key} ORDER BY key DESC LIMIT 8`;
  const citations = await publicCitations(history.flatMap((r) => r.content.signals.map((s) => s.articleId)));
  const current = (s: Signal) => citations.get(s.articleId)?.revision === s.revision;
  const known = history.flatMap((r) => r.content.signals).filter(current);
  const previousKey = isoWeekLabel(addDays(range.start, -1));
  const previousIssue = history.find((h) => h.key === previousKey)?.content;
  const previous = previousIssue?.signals.every(current) ? previousIssue.signals : null;
  const signals: Signal[] = [];
  let rejected = 0;
  const extractionModel = await modelFor('dataDemandExtract');
  for (let i = 0; i < input.rows.length; i += 8) {
    const batch = input.rows.slice(i, i + 8);
    const cached = await sql<{ article_id: string; revision: number; signals: Signal[]; rejected: number }[]>`
      SELECT article_id, revision, signals, rejected FROM data_demand_extractions
      WHERE article_id = ANY(${batch.map((m) => m.id)}::text[]) AND prompt_version = ${EXTRACT_VERSION}`;
    const pending = batch.filter((m) => !cached.some((c) => c.article_id === m.id && c.revision === m.revision));
    for (const m of batch) {
      const old = cached.find((c) => c.article_id === m.id && c.revision === m.revision);
      if (old) { signals.push(...old.signals); rejected += old.rejected; }
    }
    if (!pending.length) continue;
    const registry = [...new Map([...known, ...signals].map((s) => [s.typeKey, { typeKey: s.typeKey, dataType: s.dataType, family: s.family }])).values()];
    const user = stableJson({ registry, articles: pending.map(({ id, title, summary, material }) => ({ id, title, summary, material })) });
    const maxTokens = 6000;
    const allowance = callAllowance(extractionModel, EXTRACT_PROMPT, user, maxTokens);
    const result = await chatJson({ model: extractionModel, purpose: 'data_demand_extract', subject: pending.map((m) => `${m.id}:${m.revision}`).join(','),
      promptVersion: EXTRACT_VERSION, system: EXTRACT_PROMPT, user, schema: ExtractionSchema, maxTokens,
      beforeCall: () => reserveBudget(allowance, now) });
    let extracted;
    try { extracted = validateExtraction(pending, result.data, [...known, ...signals]); }
    catch (error) { await rejectReceivedResponse(result.receiptId, String(error)); throw error; }
    await sql.begin(async (tx) => {
      for (const row of extracted) {
        await tx`INSERT INTO data_demand_extractions (article_id, revision, prompt_version, signals, rejected)
          VALUES (${row.material.id}, ${row.material.revision}, ${EXTRACT_VERSION}, ${tx.json(row.signals as never)}, ${row.rejected})
          ON CONFLICT (article_id, revision, prompt_version) DO NOTHING`;
      }
      await completeReceipt(tx, result.receiptId);
    });
    for (const row of extracted) { signals.push(...row.signals); rejected += row.rejected; }
  }
  // Limit the synthesis brief, keeping demand signals ahead of supply-only context. Every signal
  // still appears in the saved issue and its deterministic type table.
  const brief = [...signals].sort((a, b) => Number(a.kind === 'supply') - Number(b.kind === 'supply')).slice(0, 30);
  let findings: Issue['findings'] = [];
  let receiptId: number | null = null;
  if (brief.length) {
    const model = await modelFor('dataDemandReport');
    const user = stableJson({ week: key, baseline: previous === null,
      signals: brief.map(({ id, dataType, family, kind, task, evidence, implication, action }) => ({ id, dataType, family, kind, task, evidence, implication, action })),
      changes: groupSignals(signals, previous, known) });
    const maxTokens = 1800;
    const allowance = callAllowance(model, REPORT_PROMPT, user, maxTokens);
    const result = await chatJson({ model, purpose: 'data_demand_report', subject: key, promptVersion: REPORT_VERSION,
      system: REPORT_PROMPT, user, schema: FindingsSchema, maxTokens, beforeCall: () => reserveBudget(allowance, now) });
    const ids = new Set(brief.map((s) => s.id));
    findings = result.data.findings.filter((f) => f.signalIds.every((id) => ids.has(id)));
    receiptId = result.receiptId;
  }
  const content: Issue = { key, start: range.start, end: range.end, generatedAt: now.toISOString(), signals, findings,
    groups: groupSignals(signals, previous, known), previousKey: previous === null ? null : previousKey,
    stats: { available: input.total, analysed: input.rows.length, rejected, limited: input.total > input.rows.length } };
  await sql.begin(async (tx) => {
    await tx`INSERT INTO data_demand_reports (key, window_start, window_end, content, generated_at)
      VALUES (${key}, ${start}, ${end}, ${tx.json(content as never)}, ${now}) ON CONFLICT (key) DO NOTHING`;
    if (receiptId !== null) await completeReceipt(tx, receiptId);
  });
  return { key, status: 'published', signals: signals.length, analysed: input.rows.length };
}

export const composeDueDemand = (now = new Date()) => composeDemandWeek(dueWeek(now), now);
