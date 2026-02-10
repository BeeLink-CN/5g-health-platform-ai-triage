import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SchemaValidator } from '../../../dist/contracts/schema-validator.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('SchemaValidator', () => {
    const testContractsDir = './test-contracts';
    let validator: SchemaValidator;

    beforeAll(() => {
        // Create test contracts directory
        mkdirSync(testContractsDir, { recursive: true });
        mkdirSync(join(testContractsDir, 'events'), { recursive: true });

        // Create test schemas
        const vitalsRecordedSchema = {
            $id: 'https://5g-health-platform.example.com/schemas/events/vitals-recorded.json',
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            required: ['event_name', 'event_id', 'timestamp', 'payload'],
            properties: {
                event_name: { type: 'string', const: 'vitals.recorded' },
                event_id: { type: 'string', format: 'uuid' },
                timestamp: { type: 'string', format: 'date-time' },
                payload: {
                    type: 'object',
                    required: ['patient_id', 'heart_rate', 'oxygen_saturation', 'timestamp'],
                    properties: {
                        patient_id: { type: 'string', format: 'uuid' },
                        heart_rate: { type: 'integer', minimum: 0, maximum: 300 },
                        oxygen_saturation: { type: 'integer', minimum: 0, maximum: 100 },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                },
            },
        };

        const alertRaisedSchema = {
            $id: 'https://5g-health-platform.example.com/schemas/events/patient-alert-raised.json',
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            required: ['event_name', 'event_id', 'timestamp', 'payload'],
            properties: {
                event_name: { type: 'string', const: 'patient.alert.raised' },
                event_id: { type: 'string', format: 'uuid' },
                timestamp: { type: 'string', format: 'date-time' },
                payload: {
                    type: 'object',
                    required: ['patient_id', 'severity', 'reasons', 'suggested_action', 'vitals_snapshot'],
                    properties: {
                        patient_id: { type: 'string', format: 'uuid' },
                        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                        reasons: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['code', 'message'],
                                properties: {
                                    code: { type: 'string' },
                                    message: { type: 'string' },
                                },
                            },
                        },
                        suggested_action: { type: 'string' },
                        vitals_snapshot: {
                            type: 'object',
                            required: ['heart_rate', 'oxygen_saturation', 'timestamp'],
                            properties: {
                                heart_rate: { type: 'number' },
                                oxygen_saturation: { type: 'number' },
                                timestamp: { type: 'string', format: 'date-time' },
                            },
                        },
                    },
                },
            },
        };

        writeFileSync(
            join(testContractsDir, 'events', 'vitals-recorded.json'),
            JSON.stringify(vitalsRecordedSchema, null, 2),
        );

        writeFileSync(
            join(testContractsDir, 'events', 'patient-alert-raised.json'),
            JSON.stringify(alertRaisedSchema, null, 2),
        );

        // Initialize validator
        validator = new SchemaValidator(testContractsDir);
        validator.loadSchemas();
    });

    afterAll(() => {
        // Clean up test directory
        rmSync(testContractsDir, { recursive: true, force: true });
    });

    describe('Vitals Recorded Validation', () => {
        it('should validate a correct vitals.recorded event', () => {
            const validEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: 75,
                    oxygen_saturation: 98,
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const result = validator.validateVitalsRecorded(validEvent);
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });

        it('should reject event with missing required fields', () => {
            const invalidEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                // Missing timestamp and payload
            };

            const result = validator.validateVitalsRecorded(invalidEvent);
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors).toContain('required');
        });

        it('should reject event with invalid UUID format', () => {
            const invalidEvent = {
                event_name: 'vitals.recorded',
                event_id: 'not-a-uuid',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: 75,
                    oxygen_saturation: 98,
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const result = validator.validateVitalsRecorded(invalidEvent);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('format');
        });

        it('should reject event with invalid heart_rate type', () => {
            const invalidEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: '75', // Should be integer
                    oxygen_saturation: 98,
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const result = validator.validateVitalsRecorded(invalidEvent);
            expect(result.valid).toBe(false);
        });

        it('should reject event with out-of-range values', () => {
            const invalidEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: 75,
                    oxygen_saturation: 150, // Out of range
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const result = validator.validateVitalsRecorded(invalidEvent);
            expect(result.valid).toBe(false);
        });
    });

    describe('Alert Raised Validation', () => {
        it('should validate a correct patient.alert.raised event', () => {
            const validAlert = {
                event_name: 'patient.alert.raised',
                event_id: '123e4567-e89b-12d3-a456-426614174002',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    severity: 'high',
                    reasons: [
                        {
                            code: 'HEART_RATE_HIGH',
                            message: 'Heart rate exceeds threshold',
                        },
                    ],
                    suggested_action: 'Monitor patient closely',
                    vitals_snapshot: {
                        heart_rate: 130,
                        oxygen_saturation: 98,
                        timestamp: '2024-01-01T12:00:00Z',
                    },
                },
            };

            const result = validator.validateAlertRaised(validAlert);
            expect(result.valid).toBe(true);
        });

        it('should reject alert with invalid severity value', () => {
            const invalidAlert = {
                event_name: 'patient.alert.raised',
                event_id: '123e4567-e89b-12d3-a456-426614174002',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    severity: 'critical', // Not in enum
                    reasons: [
                        {
                            code: 'HEART_RATE_HIGH',
                            message: 'Heart rate exceeds threshold',
                        },
                    ],
                    suggested_action: 'Monitor patient closely',
                    vitals_snapshot: {
                        heart_rate: 130,
                        oxygen_saturation: 98,
                        timestamp: '2024-01-01T12:00:00Z',
                    },
                },
            };

            const result = validator.validateAlertRaised(invalidAlert);
            expect(result.valid).toBe(false);
        });

        it('should reject alert with missing vitals_snapshot', () => {
            const invalidAlert = {
                event_name: 'patient.alert.raised',
                event_id: '123e4567-e89b-12d3-a456-426614174002',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    severity: 'high',
                    reasons: [
                        {
                            code: 'HEART_RATE_HIGH',
                            message: 'Heart rate exceeds threshold',
                        },
                    ],
                    suggested_action: 'Monitor patient closely',
                    // Missing vitals_snapshot
                },
            };

            const result = validator.validateAlertRaised(invalidAlert);
            expect(result.valid).toBe(false);
        });
    });
});
