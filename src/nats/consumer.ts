import { AckPolicy, DeliverPolicy } from 'nats';
import { logger } from '../config/logger.js';
import { SchemaValidator } from '../contracts/schema-validator.js';
import { RulesEngine } from '../rules/engine.js';
import { NatsClient } from './connection.js';
import { AlertPublisher } from './publisher.js';
import { Metrics } from '../metrics/counter.js';
import type { VitalsData } from '../rules/types.js';

export interface ConsumerConfig {
    streamName: string;
    durableName: string;
    subject: string;
}

export class VitalsConsumer {
    constructor(
        private natsClient: NatsClient,
        private validator: SchemaValidator,
        private rulesEngine: RulesEngine,
        private alertPublisher: AlertPublisher,
        private metrics: Metrics,
        private config: ConsumerConfig,
    ) { }

    async start(): Promise<void> {
        const nc = this.natsClient.getConnection();
        const js = nc.jetstream();

        logger.info(
            {
                stream: this.config.streamName,
                durable: this.config.durableName,
                subject: this.config.subject,
            },
            'Starting JetStream consumer',
        );

        try {
            // Create or get durable consumer
            const consumer = await js.consumers.get(this.config.streamName, this.config.durableName);

            logger.info({ durable: this.config.durableName }, 'Using existing consumer');

            // Start consuming messages
            const messages = await consumer.consume({
                max_messages: 100, // Process up to 100 messages concurrently
            });

            for await (const msg of messages) {
                await this.handleMessage(msg);
            }
        } catch (err: any) {
            // Consumer doesn't exist, create it
            if (err.message?.includes('consumer not found')) {
                logger.info('Consumer not found, creating new consumer');

                const jsm = await nc.jetstreamManager();
                await jsm.consumers.add(this.config.streamName, {
                    durable_name: this.config.durableName,
                    filter_subject: this.config.subject,
                    ack_policy: AckPolicy.Explicit,
                    deliver_policy: DeliverPolicy.All,
                    max_deliver: 5, // Retry up to 5 times
                    ack_wait: 30_000_000_000, // 30 seconds in nanoseconds
                });

                const consumer = await js.consumers.get(this.config.streamName, this.config.durableName);

                logger.info({ durable: this.config.durableName }, 'Consumer created');

                // Start consuming
                const messages = await consumer.consume({
                    max_messages: 100,
                });

                for await (const msg of messages) {
                    await this.handleMessage(msg);
                }
            } else {
                throw err;
            }
        }
    }

    private async handleMessage(msg: any): Promise<void> {
        this.metrics.incrementReceived();

        let vitalsData: any;

        // Step 1: Parse JSON
        try {
            const data = msg.json();
            vitalsData = data;
        } catch (err) {
            logger.error({ error: err, data: msg.data }, 'JSON parse error');
            this.metrics.incrementDroppedInvalid();
            msg.ack(); // ACK to avoid reprocessing
            return;
        }

        // Step 2: Extract payload if wrapped in event envelope
        let vitals: VitalsData;
        if (vitalsData.payload) {
            vitals = vitalsData.payload;
        } else {
            vitals = vitalsData;
        }

        // Step 3: Validate schema
        const validationResult = this.validator.validateVitalsRecorded(vitalsData);
        if (!validationResult.valid) {
            logger.warn(
                { errors: validationResult.errors, data: vitalsData },
                'Schema validation failed',
            );
            this.metrics.incrementDroppedInvalid();
            msg.ack(); // ACK to avoid poison message loop
            return;
        }

        this.metrics.incrementValidated();

        // Step 4: Evaluate with rules engine
        const alertResult = this.rulesEngine.evaluate(vitals);

        if (!alertResult.shouldAlert) {
            msg.ack();
            return;
        }

        // Step 5: Publish alert
        logger.info(
            {
                patient_id: vitals.patient_id,
                severity: alertResult.severity,
                reasons: alertResult.reasons,
            },
            'Alert triggered',
        );

        const published = await this.alertPublisher.publishAlert(
            vitals,
            alertResult.severity!,
            alertResult.reasons!,
            alertResult.suggestedAction!,
        );

        if (published) {
            this.metrics.incrementAlertsPublished();
            msg.ack();
        } else {
            // Failed to publish alert
            this.metrics.incrementDroppedPublishFail();

            // NAK with delay to retry
            msg.nak(2000); // 2 second delay

            logger.warn(
                { patient_id: vitals.patient_id },
                'Alert publish failed, message NAKed for retry',
            );
        }
    }
}
