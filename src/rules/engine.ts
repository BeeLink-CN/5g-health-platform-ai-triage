import { logger } from '../config/logger.js';
import type {
    RulesConfig,
    VitalsData,
    AlertResult,
    AlertReason,
    Severity,
    PatientState,
} from './types.js';

export class RulesEngine {
    private patientStates = new Map<string, PatientState>();

    constructor(
        private rules: RulesConfig,
        private stateTtlMs: number,
    ) {
        // Start periodic cleanup of stale states
        this.startCleanupInterval();
    }

    /**
     * Periodically clean up stale patient states to prevent memory leaks
     */
    private startCleanupInterval(): void {
        setInterval(() => {
            this.cleanupStaleStates();
        }, this.stateTtlMs);
    }

    /**
     * Remove patient states that haven't been updated within TTL
     */
    private cleanupStaleStates(): void {
        const now = Date.now();
        const stalePatients: string[] = [];

        for (const [patientId, state] of this.patientStates.entries()) {
            if (now - state.lastUpdated > this.stateTtlMs) {
                stalePatients.push(patientId);
            }
        }

        stalePatients.forEach((patientId) => {
            this.patientStates.delete(patientId);
            logger.debug({ patientId }, 'Evicted stale patient state');
        });

        if (stalePatients.length > 0) {
            logger.info({ count: stalePatients.length }, 'Cleaned up stale patient states');
        }
    }

    /**
     * Get or create patient state
     */
    private getPatientState(patientId: string): PatientState {
        let state = this.patientStates.get(patientId);

        if (!state) {
            state = {
                patientId,
                violations: {},
                lastUpdated: Date.now(),
            };
            this.patientStates.set(patientId, state);
        }

        return state;
    }

    /**
     * Update patient state with new violation count
     */
    private updateViolationCount(
        state: PatientState,
        violationType: keyof PatientState['violations'],
        isViolating: boolean,
    ): number {
        if (isViolating) {
            const current = state.violations[violationType] || 0;
            state.violations[violationType] = current + 1;
            return state.violations[violationType]!;
        } else {
            // Reset violation count if no longer violating
            state.violations[violationType] = 0;
            return 0;
        }
    }

    /**
     * Evaluate vitals and return alert decision
     */
    evaluate(vitals: VitalsData): AlertResult {
        const reasons: AlertReason[] = [];
        const state = this.getPatientState(vitals.patient_id);
        state.lastUpdated = Date.now();

        // Check heart rate high
        if (this.rules.heart_rate?.high_threshold !== undefined) {
            const isViolating = vitals.heart_rate > this.rules.heart_rate.high_threshold;
            const count = this.updateViolationCount(state, 'heart_rate_high', isViolating);
            const persistSamples = this.rules.heart_rate.persist_samples || 1;

            if (count >= persistSamples) {
                reasons.push({
                    code: 'HEART_RATE_HIGH',
                    message: `Heart rate ${vitals.heart_rate} exceeds threshold ${this.rules.heart_rate.high_threshold}`,
                });
            }
        }

        // Check heart rate low
        if (this.rules.heart_rate?.low_threshold !== undefined) {
            const isViolating = vitals.heart_rate < this.rules.heart_rate.low_threshold;
            const count = this.updateViolationCount(state, 'heart_rate_low', isViolating);
            const persistSamples = this.rules.heart_rate.persist_samples || 1;

            if (count >= persistSamples) {
                reasons.push({
                    code: 'HEART_RATE_LOW',
                    message: `Heart rate ${vitals.heart_rate} below threshold ${this.rules.heart_rate.low_threshold}`,
                });
            }
        }

        // Check SpO2 low
        if (this.rules.spo2?.low_threshold !== undefined) {
            const isViolating = vitals.oxygen_saturation < this.rules.spo2.low_threshold;
            const count = this.updateViolationCount(state, 'spo2_low', isViolating);
            const persistSamples = this.rules.spo2.persist_samples || 1;

            if (count >= persistSamples) {
                reasons.push({
                    code: 'SPO2_LOW',
                    message: `SpO2 ${vitals.oxygen_saturation}% below threshold ${this.rules.spo2.low_threshold}%`,
                });
            }
        }

        // No violations
        if (reasons.length === 0) {
            return { shouldAlert: false };
        }

        // Determine severity based on number and type of violations
        const severity = this.calculateSeverity(reasons, vitals);
        const suggestedAction = this.getSuggestedAction(reasons, vitals);

        return {
            shouldAlert: true,
            severity,
            reasons,
            suggestedAction,
        };
    }

    /**
     * Calculate alert severity based on violations
     */
    private calculateSeverity(reasons: AlertReason[], vitals: VitalsData): Severity {
        // Multiple violations = high severity
        if (reasons.length >= 2) {
            return 'high';
        }

        // Check for critical individual values
        for (const reason of reasons) {
            if (reason.code === 'SPO2_LOW' && vitals.oxygen_saturation < 85) {
                return 'high';
            }
            if (reason.code === 'HEART_RATE_HIGH' && vitals.heart_rate > 140) {
                return 'high';
            }
            if (reason.code === 'HEART_RATE_LOW' && vitals.heart_rate < 40) {
                return 'high';
            }
        }

        // Check for moderate concerns
        for (const reason of reasons) {
            if (reason.code === 'SPO2_LOW' && vitals.oxygen_saturation < 90) {
                return 'medium';
            }
            if (reason.code === 'HEART_RATE_HIGH' && vitals.heart_rate > 130) {
                return 'medium';
            }
            if (reason.code === 'HEART_RATE_LOW' && vitals.heart_rate < 45) {
                return 'medium';
            }
        }

        return 'low';
    }

    /**
     * Generate suggested action based on violations
     */
    private getSuggestedAction(reasons: AlertReason[], vitals: VitalsData): string {
        const codes = reasons.map((r) => r.code);

        // Multiple violations
        if (codes.length >= 2) {
            return 'Immediate medical attention required. Multiple vital signs abnormal.';
        }

        // SpO2 specific
        if (codes.includes('SPO2_LOW')) {
            if (vitals.oxygen_saturation < 85) {
                return 'Critical: Administer oxygen immediately and contact physician.';
            }
            return 'Monitor closely and consider supplemental oxygen.';
        }

        // Heart rate high
        if (codes.includes('HEART_RATE_HIGH')) {
            if (vitals.heart_rate > 140) {
                return 'Urgent: Check patient status and notify physician.';
            }
            return 'Monitor patient and reassess in 5 minutes.';
        }

        // Heart rate low
        if (codes.includes('HEART_RATE_LOW')) {
            if (vitals.heart_rate < 40) {
                return 'Urgent: Check patient responsiveness and notify physician.';
            }
            return 'Monitor patient closely and assess symptoms.';
        }

        return 'Continue monitoring vital signs.';
    }

    /**
     * Get current number of tracked patients (for metrics)
     */
    getTrackedPatientsCount(): number {
        return this.patientStates.size;
    }
}
