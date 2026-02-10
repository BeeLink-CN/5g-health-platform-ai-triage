import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VitalsConsumer } from '../../../dist/nats/consumer.js';
import { RulesEngine } from '../../../dist/rules/engine.js';
import { SchemaValidator } from '../../../dist/contracts/schema-validator.js';
import { NatsClient } from '../../../dist/nats/connection.js';
import { AlertPublisher } from '../../../dist/nats/publisher.js';
import { Metrics } from '../../../dist/metrics/counter.js';

// Mock implementations
class MockMsg {
    constructor(
        public data: any,
        public ackCalled = false,
        public nakCalled = false,
    ) { }

    json() {
        if (typeof this.data === 'string') {
            return JSON.parse(this.data);
        }
        return this.data;
    }

    ack() {
        this.ackCalled = true;
    }

    nak(delay?: number) {
        this.nakCalled = true;
    }
}

describe('VitalsConsumer Message Handling', () => {
    let mockNatsClient: any;
    let mockValidator: any;
    let mockRulesEngine: any;
    let mockPublisher: any;
    let metrics: Metrics;

    beforeEach(() => {
        metrics = new Metrics();

        mockNatsClient = {
            getConnection: vi.fn(() => ({
                jetstream: vi.fn(() => ({
                    consumers: {
                        get: vi.fn(),
                        add: vi.fn(),
                    },
                })),
            })),
        };

        mockValidator = {
            validateVitalsRecorded: vi.fn(() => ({ valid: true })),
        };

        mockRulesEngine = {
            evaluate: vi.fn(() => ({ shouldAlert: false })),
        };

        mockPublisher = {
            publishAlert: vi.fn(() => Promise.resolve(true)),
        };
    });

    describe('JSON Parse Error', () => {
        it('should ACK message and increment dropped_invalid on parse error', async () => {
            const consumer = new VitalsConsumer(
                mockNatsClient as any,
                mockValidator as any,
                mockRulesEngine as any,
                mockPublisher as any,
                metrics,
                {
                    streamName: 'events',
                    durableName: 'ai-triage',
                    subject: 'vitals.recorded',
                },
            );

            const mockMsg = new MockMsg('invalid json{');
            mockMsg.json = () => {
                throw new Error('Parse error');
            };

            await (consumer as any).handleMessage(mockMsg);

            expect(mockMsg.ackCalled).toBe(true);
            expect(mockMsg.nakCalled).toBe(false);
            expect(metrics.getCounters().dropped_invalid).toBe(1);
        });
    });

    describe('Schema Validation Failure', () => {
        it('should ACK message and increment dropped_invalid on validation error', async () => {
            mockValidator.validateVitalsRecorded = vi.fn(() => ({
                valid: false,
                errors: 'Missing required field',
            }));

            const consumer = new VitalsConsumer(
                mockNatsClient as any,
                mockValidator as any,
                mockRulesEngine as any,
                mockPublisher as any,
                metrics,
                {
                    streamName: 'events',
                    durableName: 'ai-triage',
                    subject: 'vitals.recorded',
                },
            );

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

            const mockMsg = new MockMsg(validEvent);

            await (consumer as any).handleMessage(mockMsg);

            expect(mockMsg.ackCalled).toBe(true);
            expect(mockMsg.nakCalled).toBe(false);
            expect(metrics.getCounters().dropped_invalid).toBe(1);
        });
    });

    describe('No Alert Triggered', () => {
        it('should ACK message when no alert is needed', async () => {
            const consumer = new VitalsConsumer(
                mockNatsClient as any,
                mockValidator as any,
                mockRulesEngine as any,
                mockPublisher as any,
                metrics,
                {
                    streamName: 'events',
                    durableName: 'ai-triage',
                    subject: 'vitals.recorded',
                },
            );

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

            const mockMsg = new MockMsg(validEvent);

            await (consumer as any).handleMessage(mockMsg);

            expect(mockMsg.ackCalled).toBe(true);
            expect(metrics.getCounters().validated).toBe(1);
            expect(metrics.getCounters().alerts_published).toBe(0);
        });
    });

    describe('Alert Published Successfully', () => {
        it('should ACK message and increment alerts_published on successful publish', async () => {
            mockRulesEngine.evaluate = vi.fn(() => ({
                shouldAlert: true,
                severity: 'high',
                reasons: [{ code: 'HEART_RATE_HIGH', message: 'Too high' }],
                suggestedAction: 'Check patient',
            }));

            const consumer = new VitalsConsumer(
                mockNatsClient as any,
                mockValidator as any,
                mockRulesEngine as any,
                mockPublisher as any,
                metrics,
                {
                    streamName: 'events',
                    durableName: 'ai-triage',
                    subject: 'vitals.recorded',
                },
            );

            const validEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: 130,
                    oxygen_saturation: 98,
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const mockMsg = new MockMsg(validEvent);

            await (consumer as any).handleMessage(mockMsg);

            expect(mockMsg.ackCalled).toBe(true);
            expect(mockMsg.nakCalled).toBe(false);
            expect(metrics.getCounters().alerts_published).toBe(1);
            expect(mockPublisher.publishAlert).toHaveBeenCalled();
        });
    });

    describe('Alert Publish Failure', () => {
        it('should NAK message and increment dropped_publish_fail on publish error', async () => {
            mockRulesEngine.evaluate = vi.fn(() => ({
                shouldAlert: true,
                severity: 'high',
                reasons: [{ code: 'HEART_RATE_HIGH', message: 'Too high' }],
                suggestedAction: 'Check patient',
            }));

            mockPublisher.publishAlert = vi.fn(() => Promise.resolve(false));

            const consumer = new VitalsConsumer(
                mockNatsClient as any,
                mockValidator as any,
                mockRulesEngine as any,
                mockPublisher as any,
                metrics,
                {
                    streamName: 'events',
                    durableName: 'ai-triage',
                    subject: 'vitals.recorded',
                },
            );

            const validEvent = {
                event_name: 'vitals.recorded',
                event_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2024-01-01T12:00:00Z',
                payload: {
                    patient_id: '123e4567-e89b-12d3-a456-426614174001',
                    heart_rate: 130,
                    oxygen_saturation: 98,
                    timestamp: '2024-01-01T12:00:00Z',
                },
            };

            const mockMsg = new MockMsg(validEvent);

            await (consumer as any).handleMessage(mockMsg);

            expect(mockMsg.ackCalled).toBe(false);
            expect(mockMsg.nakCalled).toBe(true);
            expect(metrics.getCounters().dropped_publish_fail).toBe(1);
        });
    });
});
