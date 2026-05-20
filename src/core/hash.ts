import { createHash } from 'node:crypto';

export function newsId(sourceId: string, title: string, publishedAt: Date): string {
  const payload = `${sourceId}|${title.trim()}|${publishedAt.toISOString()}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function signalId(): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16);
}
