import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';
import { SchemaValidator } from '../contracts/schema-validator.js';
import { NatsClient } from './connection.js';
import type { AlertReason, Severity, VitalsData } from '../rules/types.js';

export interface AlertEvent {
    event_name: string;
    event_id: string;
    timestamp: string;
    payload: {
        patient_id: string;
        severity: Severity;
        reasons: AlertReason[];
        suggested_action: string;
        vitals_snapshot: {
            heart_rate: number;
            oxygen_saturation: number;
            timestamp: string;
        };
    };
}

export class AlertPublisher {
    constructor(
        private natsClient: NatsClient,
        private validator: SchemaValidator,
        private streamName: string,
    ) { }

    async publishAlert(
        vitals: VitalsData,
        severity: Severity,
        reasons: AlertReason[],
        suggestedAction: string,
    ): Promise<boolean> {
        const alertEvent: AlertEvent = {
            event_name: 'patient.alert.raised',
            event_id: uuidv4(),
            timestamp: new Date().toISOString(),
            payload: {
                patient_id: vitals.patient_id,
                severity,
                reasons,
                suggested_action: suggestedAction,
                vitals_snapshot: {
                    heart_rate: vitals.heart_rate,
                    oxygen_saturation: vitals.oxygen_saturation,
                    timestamp: vitals.timestamp,
                },
            },
        };

        // Validate before publishing
        const validationResult = this.validator.validateAlertRaised(alertEvent);
        if (!validationResult.valid) {
            logger.error(
                { errors: validationResult.errors, alert: alertEvent },
                'Alert validation failed',
            );
            return false;
        }

        try {
            const nc = this.natsClient.getConnection();
            const js = nc.jetstream();

            await js.publish(
                'patient.alert.raised',
                JSON.stringify(alertEvent),
                { stream: this.streamName },
            );

            logger.info(
                {
                    event_id: alertEvent.event_id,
                    patient_id: vitals.patient_id,
                    severity,
                },
                'Alert published successfully',
            );

            return true;
        } catch (err) {
            logger.error(
                { error: err, alert: alertEvent },
                'Failed to publish alert to NATS',
            );
            return false;
        }
    }
}
