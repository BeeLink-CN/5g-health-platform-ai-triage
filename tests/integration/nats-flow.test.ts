import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, NatsConnection, JetStreamClient, JetStreamManager } from 'nats';
import { v4 as uuidv4 } from 'uuid';

describe('Integration Test with NATS', () => {
    let nc: NatsConnection;
    let js: JetStreamClient;
    let jsm: JetStreamManager;

    const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
    const STREAM_NAME = 'events';

    /**
     * Retry helper: calls `fn` up to `maxRetries` times with `delayMs` between attempts.
     * Useful for JetStream operations that may return 503 while still initializing.
     */
    async function retry<T>(fn: () => Promise<T>, maxRetries = 30, delayMs = 2000): Promise<T> {
        let lastError: unknown;
        for (let i = 1; i <= maxRetries; i++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                console.log(`Retry ${i}/${maxRetries} failed: ${err}`);
                if (i < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
        throw lastError;
    }

    beforeAll(async () => {
        // Wait for NATS connection with retries
        nc = await retry(async () => {
            const conn = await connect({ servers: NATS_URL });
            console.log('Connected to NATS');
            return conn;
        }, 30, 1000);

        jsm = await nc.jetstreamManager();
        js = nc.jetstream();

        // Wait for JetStream to be fully operational by testing account info
        await retry(async () => {
            const info = await jsm.getAccountInfo();
            console.log('JetStream account info retrieved:', JSON.stringify(info));
        }, 30, 1000);

        // Delete existing stream if present (ignore errors)
        try {
            await jsm.streams.delete(STREAM_NAME);
            console.log('Deleted existing stream');
        } catch {
            // Stream might not exist, that's fine
        }

        // Create stream with retry logic (this is where 503 often occurs)
        await retry(async () => {
            await jsm.streams.add({
                name: STREAM_NAME,
                subjects: ['vitals.recorded', 'patient.alert.raised'],
            });
            console.log('Stream created successfully');
        }, 15, 2000);

    }, 120000); // 2 minute timeout for setup

    afterAll(async () => {
        if (nc) {
            await nc.drain();
        }
    });

    it('should publish vitals.recorded event and receive patient.alert.raised', async () => {
        // Create durable consumer via JetStreamManager with retry logic
        const CONSUMER_NAME = 'integration-test-alerts';
        await retry(async () => {
            await jsm.consumers.add(STREAM_NAME, {
                durable_name: CONSUMER_NAME,
                filter_subject: 'patient.alert.raised',
                ack_policy: 'Explicit' as any,
            });
        }, 10, 2000);

        // Get consumer handle from JetStream client
        const consumer = await js.consumers.get(STREAM_NAME, CONSUMER_NAME);

        const alertsReceived: any[] = [];
        const messages = await consumer.consume();

        // Collect alerts
        const alertPromise = new Promise<void>((resolve) => {
            (async () => {
                for await (const msg of messages) {
                    const alert = msg.json();
                    alertsReceived.push(alert);
                    msg.ack();
                    resolve();
                    break;
                }
            })();
        });

        // Wait for AI triage service to be ready
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Publish a vitals.recorded event that should trigger an alert
        const vitalsEvent = {
            event_name: 'vitals.recorded',
            event_id: uuidv4(),
            timestamp: new Date().toISOString(),
            payload: {
                patient_id: uuidv4(),
                heart_rate: 85,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            },
        };

        // Publish normal vitals first
        await js.publish('vitals.recorded', JSON.stringify(vitalsEvent));
        console.log('Published normal vitals event');

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Now publish event that violates SpO2 threshold (should trigger immediate alert)
        const criticalVitals = {
            ...vitalsEvent,
            event_id: uuidv4(),
            timestamp: new Date().toISOString(),
            payload: {
                ...vitalsEvent.payload,
                oxygen_saturation: 85, // Below threshold (90)
                timestamp: new Date().toISOString(),
            },
        };

        await js.publish('vitals.recorded', JSON.stringify(criticalVitals));
        console.log('Published critical vitals event (low SpO2)');

        // Wait for alert
        await Promise.race([
            alertPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout waiting for alert')), 15000),
            ),
        ]);

        // Verify alert was received
        expect(alertsReceived.length).toBeGreaterThan(0);

        const alert = alertsReceived[0];
        expect(alert.event_name).toBe('patient.alert.raised');
        expect(alert.payload.patient_id).toBe(criticalVitals.payload.patient_id);
        expect(alert.payload.severity).toBeDefined();
        expect(alert.payload.reasons).toBeDefined();
        expect(alert.payload.reasons.length).toBeGreaterThan(0);
        expect(alert.payload.suggested_action).toBeDefined();
        expect(alert.payload.vitals_snapshot).toBeDefined();

        console.log('Alert received successfully:', alert);
    }, 60000); // 1 minute timeout for test
});
