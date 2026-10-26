import '../../../tests/setup.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
import { fetchListing } from '@aihot/backend/sources/listing-fetch';
import { parseAssets, assetEvent, scanRadarSource, seedRadarSources } from '../backend/radar.ts';

const NOW = new Date('2026-10-23T02:00:00Z');
const ID = 'demand-hf-dataset-allenai';
const GH = 'demand-github-allenai';
const row = { id: 'allenai/robot-data', sha: 'a'.repeat(40), createdAt: '2026-10-20T00:00:00Z', lastModified: '2026-10-21T00:00:00Z', downloads: 100, likes: 4, tags: ['robotics', 'dataset'], description: 'Robot action trajectories with task success annotations.' };
const savedPrivate = config.allowPrivateNetworkFetch;
before(async () => { config.allowPrivateNetworkFetch = true; await seedRadarSources(NOW); });
beforeEach(async () => {
  await sql`TRUNCATE data_demand_assets`;
  await sql`DELETE FROM articles WHERE source_id IN (${ID}, ${GH})`;
  await sql`UPDATE sources SET cursor = NULL, enabled = true, fail_count = 0 WHERE id IN (${ID}, ${GH})`;
});
after(async () => { config.allowPrivateNetworkFetch = savedPrivate; await closeDb(); });

async function localApi(reply: (url: URL) => { body: unknown; status?: number; headers?: Record<string, string | undefined> }) {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://stub'); hits.push(req.url!);
    const answer = reply(url);
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...answer.headers });
    res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { hits, read: (url: string, options = {}) => {
    const target = new URL(url);
    assert.ok(['huggingface.co', 'api.github.com'].includes(target.hostname));
    return fetchListing(`http://127.0.0.1:${port}${target.pathname}${target.search}`, options);
  }, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('targets preserve admin pauses, merge case aliases and add no X accounts', async () => {
  await sql`UPDATE sources SET enabled = false WHERE id = ${ID}`;
  const seeded = await seedRadarSources(NOW);
  assert.equal(seeded.added, 0);
  assert.equal(seeded.hfOrganizations, 79);
  assert.equal(seeded.githubOrganizations, 50);
  assert.equal((await sql`SELECT enabled FROM sources WHERE id = ${ID}`)[0].enabled, false);
  assert.equal((await sql`SELECT id FROM sources WHERE id LIKE 'demand-%' AND kind = 'x_search'`).length, 0);
});

test('public owned assets are parsed; an initial observation does not invent metric growth', () => {
  const [asset] = parseAssets('hf-dataset', [row, { ...row, private: true }, { ...row, id: 'outsider/data' }], 'allenai');
  assert.equal(asset.id, row.id);
  assert.equal(assetEvent('hf-dataset', asset, null, new Date('2026-10-09')), 'release');
  assert.equal(assetEvent('hf-dataset', { ...asset, created: '2020-01-01', updated: '2020-01-01' }, null, new Date('2026-10-09')), null);
  assert.equal(assetEvent('hf-dataset', { ...asset, metric: 400 }, asset, new Date('2026-10-09')), 'growth');
  assert.equal(assetEvent('hf-dataset', { ...asset, metric: 40 }, asset, new Date('2026-10-09')), null);
  const [model] = parseAssets('hf-model', [{ ...row, cardData: { datasets: ['allenai/robot-data'] } }], 'allenai');
  assert.deepEqual(model.datasets, ['allenai/robot-data']);
});

test('HF metadata and changed cards become public rule materials; unchanged scans do not call models or rewrite them', async () => {
  const api = await localApi((url) => ({ body: url.pathname.includes('/raw/') ? '# Dataset card\nRobot action trajectories and annotation guidelines.' : [row] }));
  try {
    assert.equal((await scanRadarSource(ID, NOW, api.read)).status, 'ok');
    const [article] = await sql`SELECT id, revision, body_text FROM articles WHERE source_id = ${ID}`;
    assert.match(article.body_text, /annotation guidelines/);
    const [p] = await sql`SELECT selected, eligible, body_mode FROM publications WHERE article_id = ${article.id}`;
    assert.equal(p.selected, false); assert.equal(p.eligible, true); assert.equal(p.body_mode, 'summary');
    assert.equal((await sql`SELECT origin FROM analyses WHERE article_id = ${article.id}`)[0].origin, 'rule');
    assert.equal((await scanRadarSource(ID, new Date(+NOW + 86400_000), api.read)).status, 'ok');
    assert.equal(api.hits.length, 3, 'second scan only reads the listing');
    assert.equal((await sql`SELECT revision FROM articles WHERE id = ${article.id}`)[0].revision, article.revision);
    assert.equal((await sql`SELECT count(*)::int AS count FROM articles WHERE source_id = ${ID}`)[0].count, 1);
    assert.equal((await sql`SELECT count(*)::int AS count FROM receipts WHERE purpose LIKE 'data_demand_%'`)[0].count, 0);
  } finally { await api.close(); }
});

test('pagination resumes without advancing its watermark; a failed page preserves progress', async () => {
  let fail = true;
  const next = 'https://huggingface.co/api/datasets?author=allenai&cursor=next';
  const api = await localApi((url) => url.searchParams.has('cursor')
    ? { body: fail ? { error: 'limited' } : [], status: fail ? 429 : 200, headers: { 'retry-after': '3600' } }
    : { body: [row], headers: { link: `<${next}>; rel="next"` } });
  try {
    await scanRadarSource(ID, NOW, api.read);
    const cursor = (await sql`SELECT cursor FROM sources WHERE id = ${ID}`)[0].cursor;
    assert.equal(cursor.radar.nextUrl, next); assert.equal(cursor.radar.watermark, undefined);
    assert.equal((await scanRadarSource(ID, NOW, api.read)).status, 'failed');
    assert.deepEqual((await sql`SELECT cursor FROM sources WHERE id = ${ID}`)[0].cursor, cursor);
    fail = false;
    await scanRadarSource(ID, NOW, api.read);
    const done = (await sql`SELECT cursor FROM sources WHERE id = ${ID}`)[0].cursor.radar;
    assert.equal(done.nextUrl, undefined); assert.equal(done.watermark, NOW.toISOString());
    assert.equal((await sql`SELECT count(*)::int AS count FROM articles WHERE source_id = ${ID}`)[0].count, 1);
  } finally { await api.close(); }
});

test('GitHub filters unrelated repositories, tracks stars, and does not ingest a fork', async () => {
  const repo = { full_name: 'allenai/evaluation-kit', created_at: row.createdAt, updated_at: row.lastModified, pushed_at: row.lastModified,
    stargazers_count: 200, forks_count: 5, description: 'Agent benchmark evaluation data', topics: ['benchmark'], owner: { id: 5667695, login: 'allenai' } };
  const api = await localApi((url) => url.pathname.endsWith('/readme') ? { body: '# Evaluation kit' } : url.searchParams.has('page') ? { body: [] } : {
    body: [repo, { ...repo, full_name: 'allenai/fork', fork: true }, { ...repo, full_name: 'allenai/website', description: 'CSS templates', topics: [] }],
    headers: { link: '<https://api.github.com/organizations/5667695/repos?page=2>; rel="next"' },
  });
  try {
    await scanRadarSource(GH, NOW, api.read);
    assert.equal((await sql`SELECT count(*)::int AS count FROM articles WHERE source_id = ${GH}`)[0].count, 1);
    const [saved] = await sql`SELECT metadata FROM data_demand_assets WHERE source_id = ${GH} AND asset_id = 'allenai/evaluation-kit'`;
    assert.equal(saved.metadata.metric, 200);
    assert.match((await sql`SELECT summary FROM publications WHERE source_id = ${GH}`)[0].summary, /200 stars/);
    assert.equal((await scanRadarSource(GH, NOW, api.read)).status, 'ok');
    assert.ok(api.hits.at(-1)?.startsWith('/orgs/allenai/repos?page=2'));
  } finally { await api.close(); }
});

test('the collection valve blocks manual scans before any HTTP request', async () => {
  const prior = process.env.COLLECT_ENABLED;
  process.env.COLLECT_ENABLED = 'false';
  try {
    assert.equal((await scanRadarSource(ID, NOW, async () => { throw new Error('must not send'); })).status, 'disabled');
  } finally { process.env.COLLECT_ENABLED = prior; }
});

test('an untrusted pagination link is refused before a request can leave the platform', async () => {
  const api = await localApi(() => ({ body: [], headers: { link: '<https://example.com/steal>; rel="next"' } }));
  try {
    const result = await scanRadarSource(GH, NOW, api.read);
    assert.equal(result.status, 'failed');
    assert.match('error' in result ? result.error! : '', /分页地址/);
    assert.equal(api.hits.length, 1);
    assert.equal((await sql`SELECT cursor FROM sources WHERE id = ${GH}`)[0].cursor, null);
  } finally { await api.close(); }
});
