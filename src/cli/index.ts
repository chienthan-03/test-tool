#!/usr/bin/env node
import { Command } from 'commander';
import { registerFeedsCommand } from './commands/feeds.js';
import { registerValidateCommand } from './commands/validate.js';

const program = new Command();

program.name('crypto-trader').description('Crypto news sentiment trader').version('0.1.0');

registerValidateCommand(program);
registerFeedsCommand(program);

const stubAction = (): void => {
  console.error('not implemented');
  process.exit(1);
};

program.command('start').description('Start the trading bot').action(stubAction);
program.command('backtest').description('Run a historical backtest').action(stubAction);
program.command('status').description('Show runtime status').action(stubAction);
program.command('pause').description('Pause trading loops').action(stubAction);
program.command('resume').description('Resume trading loops').action(stubAction);

program.parse();
