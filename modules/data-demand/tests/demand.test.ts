import { pointModels, stub, tag } from '../../../tests/setup.ts';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { loadModulePage } from '@aihot/backend/publication/module-pages';
import { installModules } from '@aihot/backend/modules';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { buildApp } from '../../../apps/api/src/app.ts';
import server from '../server.ts';
import { composeDemandWeek, dueWeek } from '../backend/compose.ts';
import { ExtractionSchema, groupSignals, validateExtraction, type Material } from '../backend/analysis.ts';
import { callAllowance, reserveBudget } from '../backend/budget.ts';
import type { DemandPage, Signal } from '../contracts.ts';

const NOW = new Date('2026-10-26T00:00:00Z');
const WEEK = '2026-W43';
const EVIDENCE = '我们正在征集用于浏览器操作评测的人工轨迹数据，欢迎供应商提交方案。';
const signal = {
  family: 'agent_tool' as const, typeKey: 'browser-agent-trajectories', dataType: '浏览器操作轨迹', task: '构建浏览器操作评测集',
  kind: 'explicit' as const, organizations: ['虚构客户'], services: ['annotation' as const], evidence: EVIDENCE,
  implication: '这项征集表明存在人工轨迹构建需求，交付规格仍需核实。', action: '阅读征集说明，核实任务覆盖和验收规则。',
};
const T = tag();
const source = `demand-${T}`;
installModules([server]);
beforeEach(async () => {
  await sql`TRUNCATE data_demand_reports, data_demand_extractions, data_demand_budget`;
  await sql`DELETE FROM articles WHERE source_id = ${source}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${source}, 'Demand fixture', 'rss', 'T1', 'editorial', '2100-01-01') ON CONFLICT DO NOTHING`;
});
after(async () => { installModules([]); await stopBoss(); await closeDb(); });

async function material(date = '2026-10-20T01:00:00Z') {
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${tag()}`, title: '浏览器评测数据征集',
    bodyText: EVIDENCE, bodyHtml: `<p>${EVIDENCE}</p>`, bodyStatus: 'ok', via: 'fetch', publishedAt: new Date(date) });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', 'datasets', '浏览器评测数据征集', ${EVIDENCE}, 45, false)`;
  await publishArticle(articleId);
  return articleId;
}

async function modelStub() {
  const provider = await stub((_hit, req) => {
    const body = JSON.parse(req.body);
    const input = JSON.parse(body.messages[1].content);
    const result = input.articles ? { articles: input.articles.map((a: { id: string }) => ({ articleId: a.id, signals: [signal] })) }
      : { findings: [{ title: '浏览器操作轨迹出现明确征集', analysis: '本期发现人工轨迹征集，可以进一步核实评测任务覆盖和交付验收条件。', signalIds: [input.signals[0].id] }] };
    return { choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } };
  });
  pointModels(provider.url, ['data-demand-flash', 'data-demand-pro']);
  return provider;
}

test('Beijing Monday 08:00 is the publication boundary, including year changes', () => {
  assert.equal(dueWeek(new Date('2026-10-25T23:59:59Z')), '2026-W42');
  assert.equal(dueWeek(NOW), WEEK);
  assert.equal(dueWeek(new Date('2027-01-04T00:00:00Z')), '2026-W53');
});

test('new types require literal evidence; aliases retain stable keys and invented organizations are removed', () => {
  const m: Material = { id: 'one', revision: 1, fact_key: 'fact:1', title: '征集', summary: EVIDENCE, material: '' };
  const [row] = validateExtraction([m], { articles: [{ articleId: 'one', signals: [signal, { ...signal, evidence: '这句话并没有出现在提供的任何输入材料之中。' }] }] }, []);
  assert.equal(row.signals.length, 1);
  assert.equal(row.rejected, 1);
  assert.deepEqual(row.signals[0].organizations, []);
  assert.throws(() => validateExtraction([m], { articles: [] }, []), /完整覆盖/);
  const [aliased] = validateExtraction([m], { articles: [{ articleId: 'one', signals: [{ ...signal, typeKey: 'new-name' }] }] }, row.signals);
  assert.equal(aliased.signals[0].typeKey, signal.typeKey);
});

test('one fact is counted once and the first issue does not invent growth', () => {
  const s = { ...signal, id: 'a', articleId: 'one', revision: 1, factKey: 'fact:1' } satisfies Signal;
  const group = groupSignals([s, { ...s, id: 'b', articleId: 'two' }], null, [])[0];
  assert.equal(group.count, 1);
  assert.equal(group.change, 'baseline');
  assert.equal(group.previousCount, null);
  assert.equal(groupSignals([s], [], [])[0].change, 'new');
});

test('a long literal quote becomes a short verified excerpt without paying for another batch', () => {
  const evidence = 'Continuous source quotation. '.repeat(12);
  const parsed = ExtractionSchema.parse({ articles: [{ articleId: 'one', signals: [{ ...signal, evidence }] }] });
  const [row] = validateExtraction([{ id: 'one', revision: 1, fact_key: 'fact:1', title: 'Source', summary: evidence, material: '' }], parsed, []);
  assert.equal(row.signals[0].evidence, evidence.slice(0, 180));
});

test('monthly CNY reservations are atomic; a model without priced currency is refused', async () => {
  const outcomes = await Promise.allSettled([reserveBudget(4, NOW), reserveBudget(4, NOW), reserveBudget(4, NOW)]);
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 2);
  const [row] = await sql`SELECT reserved_cny, calls FROM data_demand_budget`;
  assert.equal(row.reserved_cny, 8);
  assert.equal(row.calls, 2);
  assert.throws(() => callAllowance('qwen3.7-flash', '', '', 1000), /人民币单价/);
});

test('unselected materials produce a saved report, receipt recovery is free, and reads never call a model', async () => {
  const id = await material();
  const provider = await modelStub();
  try {
    const [p] = await sql`SELECT selected, eligible FROM publications WHERE article_id = ${id}`;
    assert.equal(p.selected, false);
    assert.equal(p.eligible, true);
    assert.equal((await composeDemandWeek(WEEK, NOW)).status, 'published');
    assert.equal(provider.hits(), 2);
    const [spent] = await sql`SELECT reserved_cny FROM data_demand_budget`;
    const page = await loadModulePage('data-demand', WEEK) as DemandPage;
    assert.equal(page.report?.signals.length, 1);
    assert.equal(page.report?.groups[0].change, 'baseline');
    assert.equal(page.report?.citations[0].sourceName, 'Demand fixture');
    assert.equal((await composeDemandWeek(WEEK, NOW)).status, 'exists');
    // Simulate a crash after receiving the synthesis but before saving the issue.
    await sql`DELETE FROM data_demand_reports WHERE key = ${WEEK}`;
    await composeDemandWeek(WEEK, NOW);
    assert.equal(provider.hits(), 2);
    assert.equal((await sql`SELECT reserved_cny FROM data_demand_budget`)[0].reserved_cny, spent.reserved_cny);
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/site/modules/data-demand' });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.json().report.key, WEEK);
      assert.equal((await app.inject({ method: 'GET', url: '/api/site/modules/data-demand/2026-W99' })).statusCode, 404);
      assert.equal(provider.hits(), 2);
    } finally { await app.close(); }
  } finally { await provider.close(); }
});

test('withdrawal removes dependent signals, type rows and synthesized findings', async () => {
  const id = await material();
  const provider = await modelStub();
  try {
    await composeDemandWeek(WEEK, NOW);
    await sql`INSERT INTO editorial_overrides (article_id, visibility) VALUES (${id}, 'withdrawn')`;
    await publishArticle(id);
    const page = await loadModulePage('data-demand', WEEK) as DemandPage;
    assert.equal(page.report?.signals.length, 0);
    assert.equal(page.report?.findings.length, 0);
    assert.equal(page.report?.groups.length, 0);
    assert.equal(page.report?.removed, 1);
    assert.equal(provider.hits(), 2);
  } finally { await provider.close(); }
});

test('a withdrawn historical citation invalidates comparisons and findings in the following issue', async () => {
  const oldId = await material('2026-10-13T01:00:00Z');
  const provider = await modelStub();
  try {
    await composeDemandWeek('2026-W42', NOW);
    await material();
    await composeDemandWeek(WEEK, NOW);
    const before = await loadModulePage('data-demand', WEEK) as DemandPage;
    assert.equal(before.report?.groups[0].change, 'same');
    await sql`INSERT INTO editorial_overrides (article_id, visibility) VALUES (${oldId}, 'withdrawn')`;
    await publishArticle(oldId);
    const after = await loadModulePage('data-demand', WEEK) as DemandPage;
    assert.equal(after.report?.signals.length, 1);
    assert.equal(after.report?.groups[0].change, 'baseline');
    assert.equal(after.report?.groups[0].previousCount, null);
    assert.equal(after.report?.findings.length, 0);
    assert.equal(after.report?.previousKey, null);
    assert.equal(provider.hits(), 4);
  } finally { await provider.close(); }
});

test('unscored HF and GitHub discoveries retain places within the 230-material cap', async () => {
  for (let i = 0; i < 230; i++) await material();
  const radarIds: string[] = [];
  for (const asset of ['hf-dataset:fixture/robot-data', 'github:fixture/robot-eval']) {
    const id = await material('2026-10-19T00:00:00Z');
    await sql`UPDATE articles SET raw = ${sql.json({ radarAsset: asset })} WHERE id = ${id}`;
    await sql`UPDATE analyses SET score = NULL WHERE article_id = ${id}`;
    await publishArticle(id);
    radarIds.push(id);
  }
  const provider = await modelStub();
  try {
    await composeDemandWeek(WEEK, NOW);
    const page = await loadModulePage('data-demand', WEEK) as DemandPage;
    assert.equal(page.report?.stats.available, 232);
    assert.equal(page.report?.stats.analysed, 230);
    assert.equal(page.report?.stats.limited, true);
    for (const id of radarIds) assert.ok(page.report?.signals.some((s) => s.articleId === id));
    assert.equal(provider.hits(), 30);
  } finally { await provider.close(); }
});

test('exhausted monthly budget prevents the actual provider request', async () => {
  await material();
  const provider = await modelStub();
  try {
    await reserveBudget(10, NOW);
    await assert.rejects(composeDemandWeek(WEEK, NOW), /预留上限/);
    assert.equal(provider.hits(), 0);
    assert.equal((await sql`SELECT key FROM data_demand_reports`).length, 0);
  } finally { await provider.close(); }
});

test('an open week and an empty input window cannot produce a misleading report', async () => {
  await assert.rejects(composeDemandWeek(WEEK, new Date('2026-10-25T10:00:00Z')), /尚未到出刊/);
  assert.equal((await composeDemandWeek(WEEK, NOW)).status, 'waiting');
  assert.equal(await loadModulePage('data-demand', WEEK), null);
  assert.equal((await loadModulePage('data-demand', null) as DemandPage).report, null);
});
