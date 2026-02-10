import pino from 'pino';
import { loadConfig } from './env.js';

const config = loadConfig();

export const logger = pino({
    level: config.log.level,
    transport:
        process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            }
            : undefined,
});
