import type Database from 'better-sqlite3';
import type { OrderSide } from '../../core/types.js';

export interface OpenTradeParams {
  id: string;
  mode: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  newsId?: string;
  newsSignalId?: string;
  openedAt?: Date;
}

export interface CloseTradeParams {
  id: string;
  exitPrice: number;
  pnlUsdt: number;
  feesUsdt?: number;
  closedAt?: Date;
}

export class TradeRepository {
  constructor(private readonly db: Database.Database) {}

  insertOpen(params: OpenTradeParams): void {
    const openedAt = (params.openedAt ?? new Date()).toISOString();

    this.db
      .prepare(
        `INSERT INTO trades (
          id, mode, symbol, side, quantity, entry_price, stop_loss, take_profit,
          news_id, news_signal_id, status, opened_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        params.id,
        params.mode,
        params.symbol,
        params.side,
        params.quantity,
        params.entryPrice,
        params.stopLoss,
        params.takeProfit,
        params.newsId ?? null,
        params.newsSignalId ?? null,
        openedAt,
      );
  }

  findOpenBySymbol(symbol: string): { id: string } | null {
    const row = this.db
      .prepare(`SELECT id FROM trades WHERE symbol = ? AND status = 'open' LIMIT 1`)
      .get(symbol) as { id: string } | undefined;

    return row ?? null;
  }

  countOpen(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM trades WHERE status = 'open'`)
      .get() as { count: number };
    return row.count;
  }

  close(params: CloseTradeParams): void {
    const closedAt = (params.closedAt ?? new Date()).toISOString();

    this.db
      .prepare(
        `UPDATE trades
         SET exit_price = ?, pnl_usdt = ?, fees_usdt = ?, status = 'closed', closed_at = ?
         WHERE id = ?`,
      )
      .run(
        params.exitPrice,
        params.pnlUsdt,
        params.feesUsdt ?? null,
        closedAt,
        params.id,
      );
  }
}
