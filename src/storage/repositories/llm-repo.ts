import type Database from 'better-sqlite3';

export interface LlmCallRecord {
  newsId: string;
  model: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  success: boolean;
  error?: string;
  createdAt?: Date;
}

export class LlmRepository {
  constructor(private readonly db: Database.Database) {}

  insertCall(record: LlmCallRecord): number {
    const createdAt = (record.createdAt ?? new Date()).toISOString();

    const result = this.db
      .prepare(
        `INSERT INTO llm_calls (
          news_id, model, latency_ms, prompt_tokens, completion_tokens, success, error, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.newsId,
        record.model,
        record.latencyMs ?? null,
        record.promptTokens ?? null,
        record.completionTokens ?? null,
        record.success ? 1 : 0,
        record.error ?? null,
        createdAt,
      );

    return Number(result.lastInsertRowid);
  }

  countLastHour(): number {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM llm_calls WHERE created_at >= ?')
      .get(since) as { count: number };

    return row.count;
  }
}
