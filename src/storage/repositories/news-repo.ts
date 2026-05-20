import type Database from 'better-sqlite3';
import type { NewsItem } from '../../core/types.js';

export class NewsRepository {
  constructor(private readonly db: Database.Database) {}

  insertRaw(item: NewsItem, rawJson?: string): void {
    this.db
      .prepare(
        `INSERT INTO news_raw (
          id, source_id, title, summary, url, published_at, fetched_at,
          symbols_json, tags_json, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.sourceId,
        item.title,
        item.summary ?? null,
        item.url,
        item.publishedAt.toISOString(),
        item.fetchedAt.toISOString(),
        JSON.stringify(item.symbols),
        JSON.stringify(item.tags),
        rawJson ?? null,
      );
  }

  exists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 AS found FROM news_raw WHERE id = ?').get(id);
    return row !== undefined;
  }

  markProcessed(newsId: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO news_processed (news_id, processed_at)
         VALUES (?, ?)`,
      )
      .run(newsId, new Date().toISOString());
  }

  isProcessed(newsId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS found FROM news_processed WHERE news_id = ?')
      .get(newsId);
    return row !== undefined;
  }
}
