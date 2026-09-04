// Custom Winston logger. Morgan (HTTP access logs) streams into this
// logger via the `morganStream` export so all logs share one format.
//
// Two real bugs fixed here (found via a user-reported "server exits with
// zero output" issue, root-caused by systematic bisection — see
// docs/chainguard-troubleshooting-server-startup.md):
//
// 1. The `logs/` directory was never guaranteed to exist. It's gitignored
//    (correctly — log files shouldn't be committed) and stripped from
//    every packaged export, so a fresh checkout has no `logs/` folder
//    until something creates it. Winston's File transports fail silently
//    when their target directory doesn't exist. Fixed by creating the
//    directory synchronously, before any transport is constructed.
//
// 2. `exceptionHandlers` only listed a File transport. Winston's
//    `exceptionHandlers` config makes Winston register its own
//    `process.on('uncaughtException', ...)` listener internally — which
//    means Winston, not Node's default handler, catches any uncaught
//    exception (e.g. Prisma Client failing to instantiate because
//    `prisma generate` hadn't been run yet). With only a File transport
//    configured, that exception was written to `logs/exceptions.log` and
//    NEVER printed to the console — so `node src/server.js` would exit
//    with a real, logged, but completely invisible-in-the-terminal error.
//    Fixed by adding a Console transport to exceptionHandlers too, so a
//    startup failure is always visible immediately, with the file log
//    remaining available for later/production debugging.
import fs from 'fs';
import winston from 'winston';
import { isProduction } from './env.js';

fs.mkdirSync('logs', { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `[${ts}] ${level}: ${stack || message}`;
});

const consoleFormat = combine(colorize(), timestamp(), logFormat);

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(errors({ stack: true }), timestamp(), logFormat),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
  exceptionHandlers: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

export const morganStream = {
  write: (message) => logger.info(message.trim()),
};
