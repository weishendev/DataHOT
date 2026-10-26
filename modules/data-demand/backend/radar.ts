// Free platform metadata enters as rule-based materials, without running the news scoring pipeline.
import { DATA_DEMAND, RADAR_WATCHLIST } from '@aihot/site/data-demand';
import { isoWeekLabel, beijingDate } from '@aihot/contracts/time';
import { sql } from '@aihot/backend/db';
import { credential } from '@aihot/backend/config';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticleTx } from '@aihot/backend/publication/publish';
import { fetchListing } from '@aihot/backend/sources/listing-fetch';
import type { GuardedFetchOptions, GuardedResponse } from '@aihot/backend/lib/http-fetch';
import { stripTags } from '@aihot/backend/lib/text';

type Platform = 'hf-dataset' | 'hf-model' | 'github';
interface Target { id: string; platform: Platform; org: string }
export interface Asset {
  id: string; version: string; created: string; updated: string; metric: number; likes: number;
  description: string; tags: string[]; datasets: string[]; readme?: string;
}
type Reader = (url: string, options?: GuardedFetchOptions) => Promise<GuardedResponse>;
const DAY = 86400_000;
const TARGETS: Target[] = [
  ...RADAR_WATCHLIST.hf.flatMap((org) => (['hf-dataset', 'hf-model'] as const).map((platform) => ({ id: `demand-${platform}-${org.toLowerCase()}`, platform, org }))),
  ...RADAR_WATCHLIST.github.map((org) => ({ id: `demand-github-${org.toLowerCase()}`, platform: 'github' as const, org })),
];
const targetById = new Map(TARGETS.map((t) => [t.id, t]));
const LABELS = { 'hf-dataset': 'HF 数据集', 'hf-model': 'HF 模型', github: 'GitHub 仓库' };
export const radarCollectionEnabled = () => process.env.COLLECT_ENABLED === 'true';
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : typeof v === 'string' ? [v] : [];
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : '';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;

export async function seedRadarSources(now = new Date()) {
  let added = 0;
  for (const [i, t] of TARGETS.entries()) {
    const rows = await sql`INSERT INTO sources (id, name, kind, config, tier, first_party, participation_mode, interval_minutes, site_fulltext, syndicate_fulltext, next_fetch_at)
      VALUES (${t.id}, ${`${LABELS[t.platform]}：${t.org}`}, 'external', '{}', 'T1', true, 'editorial', 1440, false, false, ${new Date(now.getTime() + i * 5 * 60_000)})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    added += rows.length;
  }
  return { added, hfOrganizations: RADAR_WATCHLIST.hf.length, githubOrganizations: RADAR_WATCHLIST.github.length };
}

function endpoint(t: Target): URL {
  const url = t.platform === 'github' ? new URL(`https://api.github.com/orgs/${t.org}/repos`)
    : new URL(`https://huggingface.co/api/${t.platform === 'hf-model' ? 'models' : 'datasets'}`);
  if (t.platform === 'github') {
    url.searchParams.set('sort', 'updated'); url.searchParams.set('per_page', '100'); url.searchParams.set('type', 'public');
  } else {
    url.searchParams.set('author', t.org); url.searchParams.set('sort', 'lastModified');
    url.searchParams.set('limit', '100'); url.searchParams.set('full', 'true');
  }
  url.searchParams.set('direction', '-1');
  if (t.platform === 'github') url.searchParams.set('direction', 'desc');
  return url;
}

function checkedPage(t: Target, value: string): string {
  const url = new URL(value), base = endpoint(t);
  if (url.origin !== base.origin || url.pathname !== base.pathname || url.username || url.password
    || t.platform !== 'github' && url.searchParams.get('author') !== t.org) throw new Error('雷达分页地址偏离当前组织');
  if (t.platform === 'github') url.searchParams.set('type', 'public');
  return url.toString();
}

export function parseAssets(platform: Platform, data: unknown, org: string): Asset[] {
  if (!Array.isArray(data)) throw new Error('雷达列表响应不是数组');
  const rows: Asset[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, any>;
    const id = platform === 'github' ? r.full_name : r.id;
    if (typeof id !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(id) || id.split('/')[0]!.toLowerCase() !== org.toLowerCase() || r.private === true || r.disabled === true || r.archived === true || r.fork === true) continue;
    const updated = date(platform === 'github' ? r.updated_at ?? r.pushed_at : r.lastModified);
    if (!updated) continue;
    rows.push({ id, updated, created: date(platform === 'github' ? r.created_at : r.createdAt),
      version: String(platform === 'github' ? r.pushed_at ?? updated : r.sha ?? updated),
      metric: number(platform === 'github' ? r.stargazers_count : r.downloads), likes: number(platform === 'github' ? r.forks_count : r.likes),
      description: typeof r.description === 'string' ? stripTags(r.description).slice(0, 2500) : '',
      tags: strings(platform === 'github' ? r.topics : r.tags).slice(0, 30),
      datasets: strings(r.cardData?.datasets).slice(0, 20) });
  }
  if (data.length && !rows.length && data.some((r) => r && typeof r === 'object' && !(r.private || r.disabled || r.archived || r.fork))) throw new Error('雷达列表没有可识别的组织条目');
  return rows;
}

const RELEVANT = /dataset|benchmark|evaluat|annotat|training.?data|rlhf|reward|preference|synthetic|fine.?tun|agent|robot|embodied|multimodal|instruction|data.?curat|数据|标注|评测|基准/i;
export function assetEvent(platform: Platform, asset: Asset, previous: Asset | null, floor: Date): 'release' | 'update' | 'growth' | null {
  if (platform === 'github' && !RELEVANT.test(`${asset.id} ${asset.description} ${asset.tags.join(' ')}`)) return null;
  if (!previous) return Date.parse(asset.updated) >= +floor ? (Date.parse(asset.created) >= +floor ? 'release' : 'update') : null;
  if (asset.version !== previous.version && Date.parse(asset.updated) >= +floor) return 'update';
  // HF downloads are a rolling window, never total newly downloaded copies.
  const threshold = platform === 'github' ? 50 : 100;
  if (asset.metric - previous.metric >= threshold && asset.metric >= previous.metric * 1.5) return 'growth';
  return null;
}

function assetUrl(t: Target, a: Asset) {
  return t.platform === 'github' ? `https://github.com/${a.id}` : `https://huggingface.co/${t.platform === 'hf-dataset' ? 'datasets/' : ''}${a.id}`;
}

async function storeAsset(t: Target, a: Asset, previous: Asset | null, event: ReturnType<typeof assetEvent>, now: Date) {
  return sql.begin(async (tx) => {
    let created = false;
    if (event) {
      const eventAt = event === 'growth' ? now : new Date(event === 'release' ? a.created || a.updated : a.updated);
      const metric = t.platform === 'github' ? `${a.metric} stars，${a.likes} forks` : `下载量 ${a.metric}（平台统计窗口），${a.likes} 个赞`;
      const delta = previous ? `；上次观察值 ${previous.metric}` : '；首次观察，暂无热度变化基线';
      const label = event === 'release' ? '新发布' : event === 'update' ? '内容更新' : '热度变化';
      const summary = `${LABELS[t.platform]} ${a.id}：${label}。${metric}${delta}。${a.description.slice(0, 900)}${a.tags.length ? ` 标签：${a.tags.join('、')}。` : ''}${a.datasets.length ? ` 声明使用的数据集：${a.datasets.join('、')}。` : ''}`;
      const result = await upsertMaterial({ sourceId: t.id, identityKey: `data-demand:${t.platform}:${a.id}:${isoWeekLabel(beijingDate(eventAt))}`,
        url: assetUrl(t, a), title: `${a.id} · ${label}`, author: t.org, publishedAt: eventAt, discoveredAt: now,
        bodyText: `${summary}\n${a.readme ?? ''}`.slice(0, 7000), excerpt: summary, bodyStatus: 'ok', via: 'data-demand',
        raw: { radarAsset: `${t.platform}:${a.id}`, radarEvent: event, observedAt: now.toISOString() } }, tx);
      created = result.created;
      if (result.created || result.revised) {
        const [article] = await tx`SELECT revision FROM articles WHERE id = ${result.articleId}`;
        await tx`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, selected, output)
          VALUES (${result.articleId}, ${article!.revision}, 'rule', 'pass', ${t.platform === 'hf-dataset' ? 'datasets' : 'tools'},
          ${`${a.id} · ${label}`}, ${summary}, false, ${tx.json({ rule: 'data-demand-radar', event })})`;
        await tx`UPDATE articles SET processing_state = 'analyzed', processing_error = NULL WHERE id = ${result.articleId}`;
        await publishArticleTx(tx, result.articleId, { now });
      }
    }
    await tx`INSERT INTO data_demand_assets (source_id, asset_id, metadata, observed_at) VALUES (${t.id}, ${a.id}, ${tx.json(a as never)}, ${now})
      ON CONFLICT (source_id, asset_id) DO UPDATE SET metadata = EXCLUDED.metadata, observed_at = EXCLUDED.observed_at`;
    return created;
  });
}

export async function scanRadarSource(sourceId: string, now = new Date(), read: Reader = fetchListing) {
  const t = targetById.get(sourceId);
  if (!t) return { status: 'skipped', reason: '不是数据雷达信源' };
  if (!radarCollectionEnabled()) return { status: 'disabled' };
  const [source] = await sql`SELECT enabled, cursor, interval_minutes FROM sources WHERE id = ${sourceId}`;
  if (!source?.enabled) return { status: 'skipped', reason: '信源未启用' };
  const [run] = await sql`INSERT INTO fetch_runs (source_id) VALUES (${sourceId}) RETURNING id`;
  const prior = source.cursor?.radar ?? {};
  const startedAt = prior.nextUrl ? prior.startedAt : now.toISOString();
  const floor = new Date(prior.nextUrl ? prior.floor : Math.max(now.getTime() - DATA_DEMAND.radarLookbackDays * DAY, Date.parse(prior.watermark ?? '') - DAY || 0));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (t.platform === 'github') {
    headers.accept = 'application/vnd.github+json';
    const token = credential('collectors', 'GITHUB_TOKEN');
    if (token) headers.authorization = `Bearer ${token}`;
  }
  let found = 0, events = 0, created = 0;
  try {
    const response = await read(checkedPage(t, prior.nextUrl ?? endpoint(t).toString()), { headers, redirectPolicy: 'same-origin', maxBytes: 5 * 1024 * 1024, timeoutMs: 25_000 });
    if (response.status !== 200) {
      const error = new Error(`雷达 ${LABELS[t.platform]} HTTP ${response.status}`) as Error & { retryAt?: Date };
      if ([403, 429].includes(response.status)) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const after = Number(response.headers.get('retry-after')) * 1000;
        error.retryAt = new Date(Math.max(now.getTime() + 3600_000, reset || 0, now.getTime() + (after || 0)));
      }
      throw error;
    }
    const raw = JSON.parse(response.text());
    const assets = parseAssets(t.platform, raw, t.org);
    found = assets.length;
    let detailCalls = 0;
    for (const a of assets) {
      const [saved] = await sql<{ metadata: Asset }[]>`SELECT metadata FROM data_demand_assets WHERE source_id = ${sourceId} AND asset_id = ${a.id}`;
      const old = saved?.metadata ?? null;
      const event = assetEvent(t.platform, a, old, floor);
      if (old?.version === a.version && old.readme) a.readme = old.readme;
      // Listing + at most two changed cards: <=36 requests/hour even when every scheduled target is GitHub.
      if (event && !a.readme && detailCalls < 2) {
        const url = t.platform === 'github' ? `https://api.github.com/repos/${a.id}/readme`
          : `${assetUrl(t, a)}/raw/${encodeURIComponent(/^\w{40,64}$/.test(a.version) ? a.version : 'main')}/README.md`;
        const card = await read(url, { headers: t.platform === 'github' ? { ...headers, accept: 'application/vnd.github.raw+json' } : headers, redirectPolicy: 'same-origin', maxBytes: 256 * 1024, timeoutMs: 20_000 });
        detailCalls++;
        if (card.status === 200) a.readme = card.text().slice(0, 5000);
        else if (card.status !== 404) throw new Error(`雷达说明文档 HTTP ${card.status}`);
      }
      if (await storeAsset(t, a, old, event, now)) created++;
      if (event) events++;
    }
    let link = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
    if (link && t.platform === 'github') {
      // GitHub's Link header canonicalizes /orgs/name/repos to /organizations/id/repos.
      // Accept only the id of this response's named owner, then keep our named endpoint.
      const owner = raw.find((r: any) => r?.owner?.login?.toLowerCase() === t.org.toLowerCase())?.owner;
      const next = new URL(link);
      if (Number.isSafeInteger(owner?.id) && next.origin === 'https://api.github.com' && next.pathname === `/organizations/${owner.id}/repos`) {
        next.pathname = endpoint(t).pathname;
        link = next.toString();
      }
    }
    const hasOlder = assets.some((a) => Date.parse(a.updated) < +floor);
    const nextUrl = link && !hasOlder ? checkedPage(t, link) : null;
    const radar = nextUrl ? { ...prior, floor: floor.toISOString(), startedAt, nextUrl }
      : { watermark: startedAt };
    await sql.begin(async (tx) => {
      await tx`UPDATE sources SET cursor = ${tx.json({ ...(source.cursor ?? {}), radar })}, last_fetch_at = ${now}, last_ok_at = ${now}, health = 'ok', fail_count = 0, last_error = NULL,
        next_fetch_at = ${new Date(now.getTime() + (nextUrl ? 5 : Number(source.interval_minutes)) * 60_000)}, updated_at = ${now} WHERE id = ${sourceId}`;
      await tx`UPDATE fetch_runs SET status = 'ok', finished_at = ${now}, found_count = ${found}, new_count = ${created}, detail = ${tx.json({ platform: t.platform, events, morePages: !!nextUrl, baseline: !prior.watermark })} WHERE id = ${run!.id}`;
    });
    return { sourceId, status: 'ok', found, events, morePages: !!nextUrl };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    const retryAt = (error as { retryAt?: Date }).retryAt ?? new Date(now.getTime() + 3600_000);
    await sql.begin(async (tx) => {
      await tx`UPDATE fetch_runs SET status = 'failed', finished_at = ${now}, found_count = ${found}, new_count = ${created}, error = ${message} WHERE id = ${run!.id}`;
      await tx`UPDATE sources SET last_fetch_at = ${now}, last_error = ${message}, fail_count = fail_count + 1,
        health = CASE WHEN fail_count + 1 >= 5 THEN 'failing' ELSE 'degraded' END, next_fetch_at = ${retryAt} WHERE id = ${sourceId}`;
    });
    return { sourceId, status: 'failed', error: message };
  }
}

export async function scanDueRadar(now = new Date()) {
  if (!radarCollectionEnabled()) return { status: 'disabled' };
  await seedRadarSources(now);
  const [due] = await sql`SELECT id FROM sources WHERE id = ANY(${TARGETS.map((t) => t.id)}::text[]) AND enabled
    AND next_fetch_at <= ${now} ORDER BY next_fetch_at, id LIMIT 1`;
  return due ? scanRadarSource(due.id, now) : { status: 'idle' };
}
