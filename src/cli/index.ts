#!/usr/bin/env node
import { Command } from 'commander';
import { registerBacktestCommand } from './commands/backtest.js';
import { registerFeedsCommand } from './commands/feeds.js';
import { registerPauseCommand } from './commands/pause.js';
import { registerResumeCommand } from './commands/resume.js';
import { registerStartCommand } from './commands/start.js';
import { registerStatusCommand } from './commands/status.js';
import { registerValidateCommand } from './commands/validate.js';

const program = new Command();

program.name('crypto-trader').description('Crypto news sentiment trader').version('0.1.0');

registerValidateCommand(program);
registerFeedsCommand(program);
registerStartCommand(program);
registerStatusCommand(program);
registerPauseCommand(program);
registerResumeCommand(program);
registerBacktestCommand(program);

program.parse();
