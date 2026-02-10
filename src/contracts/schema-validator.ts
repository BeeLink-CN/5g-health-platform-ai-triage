import Ajv2020Lib from 'ajv/dist/2020.js';
import addFormatsLib from 'ajv-formats';

const Ajv2020 = Ajv2020Lib.default;
const addFormats = addFormatsLib.default;
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../config/logger.js';

export interface ValidationResult {
    valid: boolean;
    errors?: string;
}

export class SchemaValidator {
    private ajv: InstanceType<typeof Ajv2020>;
    private schemasLoaded = false;

    constructor(private contractsPath: string) {
        // Initialize Ajv with 2020-12 support
        this.ajv = new Ajv2020({
            validateSchema: false, // Disable schema validation to avoid meta-schema issues
            strict: false,
            allErrors: true,
        });
        addFormats(this.ajv);
    }

    /**
     * Load all JSON schemas from the contracts directory
     */
    loadSchemas(): void {
        if (!existsSync(this.contractsPath)) {
            logger.error({ path: this.contractsPath }, 'Contracts directory not found');
            return;
        }

        try {
            const files = this.getAllJsonFiles(this.contractsPath);
            logger.info({ count: files.length, path: this.contractsPath }, 'Loading schemas');

            files.forEach((file) => {
                try {
                    const content = readFileSync(file, 'utf-8');
                    const schema = JSON.parse(content);

                    if (schema.$id) {
                        this.ajv.addSchema(schema);
                        logger.debug({ $id: schema.$id, file }, 'Schema loaded');
                    } else {
                        logger.warn({ file }, 'Schema missing $id, skipped');
                    }
                } catch (err) {
                    logger.error({ file, error: err }, 'Failed to load schema');
                }
            });

            this.schemasLoaded = true;
            logger.info('All schemas loaded successfully');
        } catch (err) {
            logger.error({ error: err }, 'Failed to load schemas');
        }
    }

    /**
     * Recursively get all JSON files from a directory
     */
    private getAllJsonFiles(dir: string): string[] {
        const files: string[] = [];

        try {
            const entries = readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                    files.push(...this.getAllJsonFiles(fullPath));
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    files.push(fullPath);
                }
            }
        } catch (err) {
            logger.error({ dir, error: err }, 'Failed to read directory');
        }

        return files;
    }

    /**
     * Validate data against a schema by its $id
     */
    validate(schemaId: string, data: unknown): ValidationResult {
        if (!this.schemasLoaded) {
            logger.warn('Schemas not loaded, validation will fail');
            return {
                valid: false,
                errors: 'Schemas not loaded',
            };
        }

        const validateFn = this.ajv.getSchema(schemaId);

        if (!validateFn) {
            logger.error({ schemaId }, 'Schema not found');
            return {
                valid: false,
                errors: `Schema not found: ${schemaId}`,
            };
        }

        const valid = validateFn(data);

        if (!valid) {
            const errors = this.ajv.errorsText(validateFn.errors);
            return {
                valid: false,
                errors,
            };
        }

        return { valid: true };
    }

    /**
     * Validate vitals.recorded event
     */
    validateVitalsRecorded(data: unknown): ValidationResult {
        return this.validate('https://5g-health-platform.example.com/schemas/events/vitals-recorded.json', data);
    }

    /**
     * Validate patient.alert.raised event
     */
    validateAlertRaised(data: unknown): ValidationResult {
        return this.validate('https://5g-health-platform.example.com/schemas/events/patient-alert-raised.json', data);
    }
}
