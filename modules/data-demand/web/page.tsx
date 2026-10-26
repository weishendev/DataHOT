import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import type { DemandPage, Signal, TypeGroup } from '../contracts.ts';
import { KINDS, SERVICES } from '../contracts.ts';
import { loadOr404 } from '@aihot/web/lib/api.server';
import { pageMeta } from '@aihot/web/lib/seo';
import { EmptyState } from '@aihot/web/components/ui/Page';
import { PhoneBar } from '@aihot/web/components/shell/PhoneBar';
import type { Screen } from '@aihot/web/components/shell/screens';

export const handle: Screen = { tab: 'me', name: '需求周报' };
export const headers = () => ({ 'Cache-Control': 'no-store' });
export const shouldRevalidate = () => true;
export async function loader({ params, request }: LoaderFunctionArgs) {
  return loadOr404<DemandPage>(`/api/site/modules/data-demand${params.key ? `/${encodeURIComponent(params.key)}` : ''}`, { signal: request.signal });
}
export const meta: MetaFunction<typeof loader> = ({ location }) => pageMeta({
  title: '数据需求分析周报', path: location.pathname,
  description: '从行业动态识别新增数据类型，发现数据采购、标注交付与评测服务的潜在需求。',
});

const CHANGES = {
  baseline: { label: '— 基线', color: 'text-ink-4' },
  new: { label: '↑ 新增', color: 'font-semibold text-red-600 dark:text-red-400' },
  up: { label: '↑ 增多', color: 'font-semibold text-red-600 dark:text-red-400' },
  same: { label: '→ 持平', color: 'text-ink-3' },
  down: { label: '↓ 减少', color: 'text-teal-700 dark:text-teal-400' },
};
const STRENGTH = [
  { min: 5, label: '极强', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  { min: 3, label: '强', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { min: 2, label: '中', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { min: 1, label: '弱', color: 'bg-bg-muted text-ink-4' },
];
const shorten = (s: string, length: number) => s.length > length ? `${s.slice(0, length - 1)}…` : s;
const priority = (s: Signal) => s.kind === 'explicit' ? 0 : s.kind === 'inferred' ? 1 : 2;

function TypeTable({ groups, report }: { groups: TypeGroup[]; report: NonNullable<DemandPage['report']> }) {
  const citations = new Map(report.citations.map((c) => [c.id, c]));
  return <div className="overflow-x-auto rounded-xl border border-line">
    <table className="w-full min-w-[670px] text-left text-[13px]">
      <thead className="bg-bg-muted text-[12px] text-ink-4"><tr><th className="w-[25%] px-4 py-3 font-medium">数据类型</th><th className="w-[76px] px-3 py-3 font-medium">强度</th><th className="w-[90px] px-3 py-3 font-medium">趋势</th><th className="px-4 py-3 font-medium">关联信号</th></tr></thead>
      <tbody>{groups.map((g) => {
        const strength = STRENGTH.find((s) => g.count >= s.min)!;
        const rows = report.signals.filter((s) => g.signalIds.includes(s.id)).sort((a, b) => priority(a) - priority(b));
        const examples = rows.filter((s, i) => rows.findIndex((r) => r.factKey === s.factKey) === i).slice(0, 2);
        const trend = CHANGES[g.change];
        return <tr id={`type-${g.typeKey}`} key={g.typeKey} className="scroll-mt-16 border-t border-line-soft align-top">
          <th className="px-4 py-4 font-semibold leading-6 text-ink">{g.dataType}</th>
          <td className="px-3 py-4"><span aria-label={`信号强度${strength.label}，${g.count}个事件`} className={`inline-block rounded px-2 py-1 text-[12px] font-semibold ${strength.color}`}>{strength.label}</span><span className="mt-1 block text-[10px] text-ink-4">{g.count} 个事件</span></td>
          <td className={`whitespace-nowrap px-3 py-4 text-[12px] ${trend.color}`} title={g.previousCount === null ? '没有可比历史，不判定新增或增长' : `本期 ${g.count}，上期 ${g.previousCount}`}>{trend.label}</td>
          <td className="px-4 py-4">
            <div className="space-y-1.5 leading-6 text-ink-3">{examples.map((s) => <p key={s.id}><span className={`mr-2 text-[10px] ${s.kind === 'explicit' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-4'}`}>{KINDS[s.kind]}</span>{s.organizations.length > 0 && <span className="font-medium text-ink-2">{shorten(s.organizations.slice(0, 2).join(' / '), 28)} · </span>}{shorten(s.task, 52)}</p>)}</div>
            <details className="mt-2">
              <summary className="w-fit cursor-pointer text-[11px] text-accent">查看依据（{rows.length}）</summary>
              <div className="mt-3 space-y-4 border-l border-line pl-3">{rows.map((s) => {
                const citation = citations.get(s.articleId)!;
                return <article key={s.id} id={`signal-${s.id}`} className="scroll-mt-16 text-[12px] leading-6">
                  <p className="font-semibold text-ink">{s.task}<span className="ml-2 font-normal text-ink-4">{KINDS[s.kind]} · {s.services.map((v) => SERVICES[v]).join(' / ')}</span></p>
                  <blockquote className="mt-1 text-ink-3">{s.evidence}</blockquote>
                  <p className="mt-1 text-ink-2">{s.implication}</p>
                  <p className="mt-1 text-ink-3">跟进：{s.action}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-accent"><Link to={`/items/${s.articleId}`}>{citation.sourceName} · 查看报道</Link><a href={citation.url} target="_blank" rel="noopener noreferrer">原文 ↗</a></p>
                </article>;
              })}</div>
            </details>
          </td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export default function DemandReportPage() {
  const { report, index } = useLoaderData<typeof loader>();
  const explicit = report?.signals.filter((s) => s.kind === 'explicit').length ?? 0;
  return <>
    <PhoneBar back={{ to: '/more', label: '我的' }} title="数据需求分析周报" />
    <div className="mx-auto max-w-[1120px] pb-12 pt-3 lg:pt-0">
      <header className="border-b border-line pb-5">
        <h1 className="text-[25px] font-bold tracking-tight text-ink lg:text-[30px]">数据需求分析周报</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-4">
          {report && <span>{report.key} · {report.start} — {report.end}</span>}
          <span>周一 08:00 更新</span>
          <Link to="/data-demand" className="text-accent">最新一期</Link>
          <details className="relative"><summary className="cursor-pointer text-accent">往期周报</summary><nav aria-label="往期需求周报" className="absolute left-0 top-7 z-10 max-h-72 w-60 overflow-y-auto rounded-lg border border-line bg-bg p-2 shadow-lg">{index.length ? index.map((i) => <Link key={i.key} to={`/data-demand/${i.key}`} aria-current={report?.key === i.key ? 'page' : undefined} className="block rounded px-3 py-2 hover:bg-bg-muted">{i.key} · {i.start}</Link>) : <p className="p-2">暂无往期</p>}</nav></details>
        </div>
      </header>
      {!report ? <EmptyState title="第一期需求周报准备中">发布后会出现在这里。</EmptyState> : <div className="space-y-6 pt-4">
        <p className="text-[12px] leading-6 text-ink-4">分析 {report.stats.analysed}/{report.stats.available} 件材料 · {report.groups.length} 类数据 · {explicit ? `${explicit} 个明确需求信号` : '暂无明确采购信号，以下为潜在需求与供给动向'}{report.removed > 0 && ` · ${report.removed} 个失效信号已隐藏`}</p>
        {report.findings.length > 0 && <section aria-labelledby="demand-findings">
          <h2 id="demand-findings" className="text-[14px] font-semibold text-ink">本周关注</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{report.findings.slice(0, 3).map((f, i) => <p key={i} className="rounded-lg bg-bg-muted px-3 py-3 text-[13px] leading-6 text-ink-2"><span className="mr-2 font-bold text-accent">0{i + 1}</span>{shorten(f.title, 32)}</p>)}</div>
        </section>}
        <section aria-labelledby="demand-types">
          <h2 id="demand-types" className="mb-3 text-[17px] font-bold text-ink">数据类型与需求信号</h2>
          {!report.groups.length ? <EmptyState title="本期暂无充分依据的数据需求信号">材料不足时保留空缺。</EmptyState> : <>
            <TypeTable groups={report.groups.slice(0, 12)} report={report} />
            {report.groups.length > 12 && <details className="mt-4"><summary className="w-fit cursor-pointer text-[12px] text-accent">其余 {report.groups.length - 12} 类数据</summary><div className="mt-3"><TypeTable groups={report.groups.slice(12)} report={report} /></div></details>}
          </>}
          <p className="mt-3 text-[11px] leading-6 text-ink-4">强度按本站去重事件数：极强 ≥5 · 强 3–4 · 中 2 · 弱 1，不代表采购意愿或市场规模。{!report.previousKey ? ' 首期或历史依据变化时仅建立基线。' : ' 趋势对比上期；新增指此前八期未见。'}{report.stats.limited && ' 本期按额度选取材料，未覆盖全部。'} 详细证据点击展开。</p>
        </section>
      </div>}
    </div>
  </>;
}
