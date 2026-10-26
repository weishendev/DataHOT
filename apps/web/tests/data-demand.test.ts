import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, expect, type Browser } from '@playwright/test';
import type { DemandPage, Issue } from '../../../modules/data-demand/contracts.ts';
import { startWebServer, type WebServer } from './web-server.ts';

const issue: Issue = {
  key: '2026-W43', start: '2026-10-19', end: '2026-10-25', generatedAt: '2026-10-26T00:00:00Z', previousKey: null,
  signals: [{ id: 'fixture:0', articleId: 'fixture', revision: 1, factKey: 'fact:1', family: 'agent_tool', typeKey: 'browser-trajectories',
    dataType: '浏览器操作轨迹', task: '构建浏览器任务评测集', kind: 'inferred', organizations: [], services: ['annotation', 'evaluation'],
    evidence: '这是浏览器任务评测数据的固定测试证据。', implication: '可进一步核实人工轨迹和标注规范需求。', action: '阅读原始材料，核实任务覆盖和验收规则。' }],
  groups: [{ typeKey: 'browser-trajectories', dataType: '浏览器操作轨迹', family: 'agent_tool', count: 1, previousCount: null, change: 'baseline', signalIds: ['fixture:0'] }],
  findings: [{ title: '浏览器任务需要更细的轨迹证据', analysis: '固定分析文本，区分事实与潜在需求。', signalIds: ['fixture:0'] }],
  stats: { available: 1, analysed: 1, rejected: 0, limited: false },
};
let empty = false;
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/site/meta') return res.end('{}');
  if (req.url?.startsWith('/api/site/modules/data-demand')) {
    const key = req.url.split('/')[5];
    if (key && !['2026-W43', '2026-W42'].includes(key)) { res.statusCode = 404; return res.end('{}'); }
    const data: DemandPage = { index: empty ? [] : [{ key: issue.key, start: issue.start, end: issue.end }, { key: '2026-W42', start: '2026-10-12', end: '2026-10-18' }],
      report: empty ? null : { ...issue, key: key ?? issue.key, removed: 0,
        citations: [{ id: 'fixture', title: '轨迹评测报道', url: 'https://example.com/evidence', sourceName: '测试来源', publishedAt: '2026-10-20T00:00:00Z' }] } };
    return res.end(JSON.stringify(data));
  }
  res.statusCode = 404; res.end('{}');
});
let web: WebServer;
let browser: Browser;
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await web?.stop(); });

test('desktop sidebar exposes the complete title, archive navigation works, and evidence is readable', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  try {
    await page.goto(`${web.origin}/data-demand`);
    await expect(page.getByRole('heading', { level: 1, name: '数据需求分析周报' })).toBeVisible();
    const link = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '数据需求分析周报' });
    await expect(link).toHaveAttribute('aria-current', 'page');
    assert.equal(await link.locator('span').last().evaluate((el) => el.scrollWidth <= el.clientWidth), true, 'full sidebar label fits without truncation');
    await expect(page.getByRole('cell', { name: '— 基线' })).toBeVisible();
    await expect(page.getByLabel('信号强度弱，1个事件')).toBeVisible();
    await expect(page.getByText('这是浏览器任务评测数据的固定测试证据。', { exact: true })).toBeHidden();
    await page.getByText('查看依据（1）', { exact: true }).click();
    await expect(page.getByText('这是浏览器任务评测数据的固定测试证据。', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '原文 ↗' })).toHaveAttribute('href', 'https://example.com/evidence');
    await page.getByText('往期周报', { exact: true }).click();
    await page.getByRole('navigation', { name: '往期需求周报' }).getByRole('link', { name: /2026-W42/ }).click();
    await expect(page).toHaveURL(`${web.origin}/data-demand/2026-W42`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${web.origin}/data-demand/2026-W42`);
    const headers = await fetch(`${web.origin}/data-demand`).then((r) => r.headers);
    assert.match(headers.get('cache-control') ?? '', /no-store/);
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal((await fetch(`${web.origin}/data-demand/2026-W99`)).status, 404);
  } finally { await page.close(); }
});

test('phone layout and the first-issue empty state remain usable', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${web.origin}/more`);
    await page.getByRole('link', { name: '数据需求分析周报' }).click();
    await expect(page.getByRole('heading', { name: '数据需求分析周报', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: '我的', exact: true }).click();
    await expect(page).toHaveURL(`${web.origin}/more`);
    await page.getByRole('link', { name: '数据需求分析周报' }).click();
    await expect(page).toHaveURL(`${web.origin}/data-demand`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    empty = true;
    await page.reload();
    await expect(page.getByText('第一期需求周报准备中')).toBeVisible();
  } finally { empty = false; await page.close(); }
});
