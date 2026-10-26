// Module publications enter the same read layer as engine reports. Recheck citations on every read.
import { sql } from '../db.ts';
import { serverModules } from '../modules.ts';
import { listedCondition } from './scope.ts';
import { publicSourceName } from './rules.ts';

export interface PublicCitation {
  id: string;
  revision: number;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string;
}

export interface ModulePublication {
  citationIds: string[];
  present: (citations: ReadonlyMap<string, PublicCitation>) => unknown;
}

export async function loadModulePage(name: string, key: string | null): Promise<unknown | null> {
  const read = serverModules().find((m) => m.name === name)?.publication;
  if (!read) return null;
  const page = await read(key);
  if (!page) return null;
  return page.present(await publicCitations(page.citationIds));
}

export async function publicCitations(articleIds: string[]): Promise<ReadonlyMap<string, PublicCitation>> {
  const ids = [...new Set(articleIds)];
  const citations = new Map<string, PublicCitation>();
  if (ids.length) {
    const rows = await sql<{ id: string; revision: number; title: string; url: string; source_name: string; published_at: Date }[]>`
      SELECT p.article_id AS id, p.revision, p.title, p.url, s.name AS source_name,
        coalesce(p.published_at, p.discovered_at) AS published_at
      FROM publications p JOIN sources s ON s.id = p.source_id
      WHERE p.article_id = ANY(${ids}::text[]) AND ${listedCondition(new Date())}`;
    for (const row of rows) citations.set(row.id, {
      id: row.id, revision: row.revision, title: row.title, url: row.url,
      sourceName: publicSourceName(row.source_name), publishedAt: row.published_at.toISOString(),
    });
  }
  return citations;
}
