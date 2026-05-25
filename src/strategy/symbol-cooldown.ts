import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';

export class SymbolCooldownTracker {
  private readonly untilMs = new Map<string, number>();
  private readonly log;

  constructor(
    private readonly config: AppConfig,
    private readonly getNow: () => Date = () => new Date(),
  ) {
    this.log = createLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
    });
  }

  wire(bus: AppEventBus): void {
    const cooldown = this.config.risk.cooldownAfterLoss;
    if (!cooldown?.enabled) {
      return;
    }

    bus.on('execution:positionClosed', (event) => {
      if (event.pnl > 0) {
        return;
      }
      const until = this.getNow().getTime() + cooldown.durationHours * 3_600_000;
      this.untilMs.set(event.symbol, until);
      this.log.debug(
        { symbol: event.symbol, pnl: event.pnl, until: new Date(until).toISOString() },
        'symbol cooldown started after loss',
      );
    });
  }

  isBlocked(symbol: string): boolean {
    const cooldown = this.config.risk.cooldownAfterLoss;
    if (!cooldown?.enabled) {
      return false;
    }

    const until = this.untilMs.get(symbol);
    if (until === undefined) {
      return false;
    }

    if (this.getNow().getTime() >= until) {
      this.untilMs.delete(symbol);
      return false;
    }

    return true;
  }
}
