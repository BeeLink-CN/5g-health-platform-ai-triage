import { readFileSync } from 'fs';
import { logger } from '../config/logger.js';
import type { RulesConfig } from './types.js';

export function loadRules(rulesPath: string): RulesConfig {
    try {
        const content = readFileSync(rulesPath, 'utf-8');
        const rules = JSON.parse(content) as RulesConfig;

        logger.info({ rulesPath, rules }, 'Rules loaded successfully');

        return rules;
    } catch (err) {
        logger.error({ rulesPath, error: err }, 'Failed to load rules');
        throw new Error(`Failed to load rules from ${rulesPath}: ${err}`);
    }
}
