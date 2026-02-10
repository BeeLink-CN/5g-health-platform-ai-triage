import pinoLib from 'pino';
import { loadConfig } from './env.js';

const config = loadConfig();

const logger = pinoLib.default({
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

export { logger };
