import pino from 'pino';

export type Logger = pino.Logger;

export interface CreateLoggerOptions {
  level: string;
  pretty: boolean;
}

export const createLogger = (options: CreateLoggerOptions): Logger => {
  if (options.pretty) {
    return pino({
      level: options.level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    });
  }

  return pino({ level: options.level });
};
