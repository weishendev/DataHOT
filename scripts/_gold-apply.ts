// Temp: 把 .data/gold-review.csv 里填好的 decision 合并回金标 .data/gold.jsonl。
// 用法：node scripts/_gold-apply.ts   （decision 列填 s / r / e，留空的不算）
import { readFileSync, writeFileSync } from "node:fs";

const root = process.cwd();
const csv = readFileSync(`${root}/.data/gold-review.csv`, "utf8").replace(/^\uFEFF/, "");
const rows = readFileSync(`${root}/.data/gold-candidates.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const decisionOf = new Map<string, string>();
for (const line of csv.split(/\r?\n/).slice(1)) {
  if (!line.trim()) continue;
  // 标题里可能有逗号：按前 6 列 + 最后第 7 列切
  const cells = line.match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*),([^,]*)$/);
  if (!cells) continue;
  const [, caseId, , , , , , raw] = cells;
  const d = raw.trim().toLowerCase();
  if (["s", "select", "y", "1"].includes(d)) decisionOf.set(caseId!.trim(), "select");
  else if (["r", "reject", "n", "0"].includes(d)) decisionOf.set(caseId!.trim(), "reject");
  else if (["e", "either"].includes(d)) decisionOf.set(caseId!.trim(), "either");
}

const out = rows
  .filter((r) => decisionOf.has(r.caseId))
  .map((r) => ({ ...r, gold: { decision: decisionOf.get(r.caseId) } }));

writeFileSync(`${root}/.data/gold.jsonl`, out.map((x) => JSON.stringify(x)).join("\n") + (out.length ? "\n" : ""));
const counts = out.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.gold.decision]: (acc[x.gold.decision] ?? 0) + 1 }), {});
console.log(`标了 ${out.length} 条：${JSON.stringify(counts)}，写到 .data/gold.jsonl；没填的有 ${rows.length - out.length} 条`);
