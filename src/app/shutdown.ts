import type { RuntimeContext } from './runtime-context.js';

let registered = false;

export const registerShutdown = (ctx: RuntimeContext): void => {
  if (registered) {
    return;
  }
  registered = true;

  const handleSigint = async (): Promise<void> => {
    ctx.log.info('shutdown_signal_received');

    ctx.rssManager?.stop();
    ctx.market.stop();

    const positions = await ctx.adapter.getAllPositions();
    if (positions.length === 0) {
      ctx.log.info('no_open_positions');
    } else {
      for (const position of positions) {
        ctx.log.info(
          {
            symbol: position.symbol,
            side: position.side,
            quantity: position.quantity,
            entryPrice: position.entryPrice,
            unrealizedPnl: position.unrealizedPnl,
          },
          'open_position_at_shutdown',
        );
      }
      ctx.log.warn(
        'Positions were not closed automatically. Manage them manually on the exchange or restart the bot.',
      );
    }

    await ctx.adapter.disconnect();
    ctx.db.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void handleSigint();
  });
};
