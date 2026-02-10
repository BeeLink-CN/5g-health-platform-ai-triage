import { config } from 'dotenv';

// Load .env file if present
config();

export interface AppConfig {
    nats: {
        url: string;
        stream: string;
        durable: string;
    };
    contracts: {
        path: string;
    };
    rules: {
        path: string;
    };
    state: {
        ttlMs: number;
    };
    http: {
        port: number;
    };
    log: {
        level: string;
    };
}

function getEnv(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Invalid number for environment variable ${key}: ${value}`);
    }
    return parsed;
}

export function loadConfig(): AppConfig {
    return {
        nats: {
            url: getEnv('NATS_URL', 'nats://localhost:4222'),
            stream: getEnv('NATS_STREAM', 'events'),
            durable: getEnv('NATS_DURABLE', 'ai-triage'),
        },
        contracts: {
            path: getEnv('CONTRACTS_PATH', './contracts'),
        },
        rules: {
            path: getEnv('RULES_PATH', './rules/default.json'),
        },
        state: {
            ttlMs: getEnvNumber('STATE_TTL_MS', 600000), // 10 minutes default
        },
        http: {
            port: getEnvNumber('HTTP_PORT', 8092),
        },
        log: {
            level: getEnv('LOG_LEVEL', 'info'),
        },
    };
}
