import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import type { Balance, OrderPlan, TradeIntent } from '../core/types.js';
import { resolvePositionScaleMultiplier } from './position-scale.js';
import { calcQuantity } from './position-sizer.js';
import { calcSlTp } from './sl-tp-calculator.js';

export type SymbolFilters = {
  stepSize: number;
  minQty: number;
  tickSize: number;
};

const roundToTick = (price: number, tickSize: number): number =>
  Math.round(price / tickSize) * tickSize;

export class RiskEngine {
  private readonly log;

  constructor(
    private readonly config: AppConfig,
    private readonly bus: AppEventBus,
    private readonly getBalance: () => Promise<Balance>,
    private readonly getFilters: (symbol: string) => Promise<SymbolFilters>,
  ) {
    this.log = createLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
    });
    this.bus.on('strategy:intent', (intent) => {
      void this.handleIntent(intent);
    });
  }

  private resolvePositionPercent(symbol: string): number {
    const override = this.config.symbolOverrides[symbol]?.risk?.positionPercent;
    return override ?? this.config.risk.positionPercent;
  }

  private resolveLeverage(): number {
    if (this.config.mode === 'sim') {
      return this.config.sim.leverage;
    }
    if (this.config.binance.margin.enabled) {
      return this.config.binance.margin.leverage;
    }
    return 1;
  }

  private async handleIntent(intent: TradeIntent): Promise<void> {
    const filters = await this.getFilters(intent.symbol);
    const balance = await this.getBalance();

    const { stopLoss, takeProfit } =
      intent.stopLoss != null && intent.takeProfit != null
        ? { stopLoss: intent.stopLoss, takeProfit: intent.takeProfit }
        : calcSlTp({
            side: intent.side,
            entryPrice: intent.entryPrice,
            atr: intent.atr,
            slMult: this.config.risk.slAtrMultiplier,
            tpMult: this.config.risk.tpAtrMultiplier,
          });

    let positionPercent = this.resolvePositionPercent(intent.symbol);
    positionPercent *= resolvePositionScaleMultiplier(this.config, intent.entryPath);

    const sized = calcQuantity({
      availableBalance: balance.available,
      positionPercent,
      entryPrice: intent.entryPrice,
      minNotional: this.config.risk.minNotionalUsdt,
      maxNotional: this.config.risk.maxNotionalUsdt,
      stepSize: filters.stepSize,
      minQty: filters.minQty,
      leverage: this.resolveLeverage(),
    });

    if (!sized) {
      this.log.warn({ symbol: intent.symbol, intentId: intent.id }, 'quantity_too_small');
      return;
    }

    const plan: OrderPlan = {
      intentId: intent.id,
      symbol: intent.symbol,
      side: intent.side,
      quantity: sized.quantity,
      entryType: 'MARKET',
      stopLoss: roundToTick(stopLoss, filters.tickSize),
      takeProfit: roundToTick(takeProfit, filters.tickSize),
      notionalUsdt: sized.notional,
    };

    this.bus.emit('risk:orderPlan', plan);
  }
}
