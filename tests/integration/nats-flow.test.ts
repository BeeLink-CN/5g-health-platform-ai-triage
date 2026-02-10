import { connect, NatsConnection, JetStreamClient, JetStreamManager } from 'nats';
import { v4 as uuidv4 } from 'uuid';

describe('Integration Test with NATS', () => {
    let nc: NatsConnection;
    let js: JetStreamClient;
    let jsm: JetStreamManager;

    const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
    const STREAM_NAME = 'events';

    beforeAll(async () => {
        // Wait for NATS to be ready
        let retries = 30;
        while (retries > 0) {
            try {
                nc = await connect({ servers: NATS_URL });
                break;
            } catch (err) {
                retries--;
                if (retries === 0) throw err;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        js = nc.jetstream();
        jsm = await nc.jetstreamManager();

        // Wait for JetStream to be fully ready with retry logic
        console.log('Waiting for JetStream to be ready...');
        let jetStreamRetries = 30;
        while (jetStreamRetries-- > 0) {
            try {
                await jsm.getAccountInfo();
                console.log('JetStream is ready!');
                break;
            } catch (err) {
                if (jetStreamRetries === 0) {
                    throw new Error(`JetStream never became ready: ${ err } `);
                }
                console.log(`JetStream not ready yet, retrying... (${ 30 - jetStreamRetries }/30)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Create stream with subjects
        try {
            await jsm.streams.delete(STREAM_NAME);
        } catch (err) {
            // Stream might not exist, ignore
        }

        await jsm.streams.add({
            name: STREAM_NAME,
            subjects: ['vitals.recorded', 'patient.alert.raised'],
        });

        console.log('NATS stream created successfully');
    }, 60000);

    afterAll(async () => {
        if (nc) {
            await nc.drain();
        }
    });

    it('should publish vitals.recorded event and receive patient.alert.raised', async () => {
        // Subscribe to patient.alert.raised
        const alertsReceived: any[] = [];
        const consumer = await js.consumers.add(STREAM_NAME, {
            durable_name: 'integration-test-alerts',
            filter_subject: 'patient.alert.raised',
            ack_policy: 'Explicit' as any,
        });

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
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Publish a vitals.recorded event that should trigger an alert
        const vitalsEvent = {
            event_name: 'vitals.recorded',
            event_id: uuidv4(),
            timestamp: new Date().toISOString(),
            payload: {
                patient_id: uuidv4(),
                heart_rate: 85, // First sample - within normal range
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            },
        };

        // Publish normal vitals first
        await js.publish('vitals.recorded', JSON.stringify(vitalsEvent));
        console.log('Published normal vitals event');

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 500));

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
                setTimeout(() => reject(new Error('Timeout waiting for alert')), 10000),
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
    }, 30000);
});
