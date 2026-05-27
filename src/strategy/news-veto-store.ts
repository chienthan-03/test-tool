import type { AppConfig } from '../config/schema.js';
import type { NewsSignal, SignalDirection } from '../core/types.js';

type VetoRecord = {
  signalId: string;
  newsId: string;
  symbols: string[];
  direction: SignalDirection;
  strength: number;
  tags: string[];
  expiresAt: Date;
  isLeader: boolean;
};

export class NewsVetoStore {
  private records: VetoRecord[] = [];

  constructor(private readonly config: AppConfig) {}

  register(signal: NewsSignal): void {
    const nv = this.config.strategy.newsVeto;
    if (!nv.enabled) return;
    if (signal.strength < nv.minStrength) return;
    if (!signal.tags.some((t) => nv.vetoTags.includes(t))) return;

    const isLeader = signal.symbols.includes(nv.leaderSymbol);
    this.records.push({
      signalId: signal.id,
      newsId: signal.newsId,
      symbols: signal.symbols,
      direction: signal.direction,
      strength: signal.strength,
      tags: signal.tags,
      expiresAt: signal.expiresAt,
      isLeader,
    });
  }

  hasOpposing(symbol: string, tradeDirection: SignalDirection, now: Date): boolean {
    this.prune(now);
    return this.activeFor(symbol, now).some((r) => r.direction !== tradeDirection);
  }

  opposingRecord(
    symbol: string,
    tradeDirection: SignalDirection,
    now: Date,
  ): VetoRecord | undefined {
    this.prune(now);
    return this.activeFor(symbol, now).find((r) => r.direction !== tradeDirection);
  }

  private activeFor(symbol: string, now: Date): VetoRecord[] {
    return this.records.filter((r) => {
      if (now.getTime() > r.expiresAt.getTime()) return false;
      if (r.symbols.includes(symbol)) return true;
      if (r.isLeader && this.config.symbols.includes(symbol)) return true;
      return false;
    });
  }

  private prune(now: Date): void {
    this.records = this.records.filter((r) => now.getTime() <= r.expiresAt.getTime());
  }
}
