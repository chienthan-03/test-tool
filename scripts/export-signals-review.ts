/**
 * Export news_signals joined with news titles for manual review.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const escapeCsv = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let dbPath = 'data/reports/experiments/sentiment-phase3/sentiment-baseline-signals.db';
  let outPath = '.planning/phases/03-sentiment-filters/signals-export.csv';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) dbPath = args[++i]!;
    else if (args[i] === '--out' && args[i + 1]) outPath = args[++i]!;
  }

  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT n.title, s.symbols_json, s.direction, s.strength, s.source
       FROM news_signals s
       LEFT JOIN news_raw n ON n.id = s.news_id
       ORDER BY s.created_at`,
    )
    .all() as {
    title: string | null;
    symbols_json: string;
    direction: string;
    strength: number;
    source: string;
  }[];

  db.close();

  const header = 'title,symbols,direction,strength,source,would_trade,notes';
  const lines = rows.map((r) => {
    const symbols = JSON.parse(r.symbols_json) as string[];
    return [
      escapeCsv(r.title ?? ''),
      escapeCsv(symbols.join(';')),
      r.direction,
      String(r.strength),
      r.source,
      '',
      '',
    ].join(',');
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${header}\n${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
