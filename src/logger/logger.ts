import { createLogger, format, transports } from 'winston';

import config from '../config/config';

const logger = createLogger({
  level: config.appMode === 'DEV' ? 'debug' : 'info',

  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `[${timestamp}] ${level}: ${stack}`
        : `[${timestamp}] ${level}: ${message}`;
    })
  ),

  transports: [
    new transports.Console(),
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

export default logger;
