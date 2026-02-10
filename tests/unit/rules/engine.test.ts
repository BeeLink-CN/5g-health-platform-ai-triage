import { RulesEngine } from '../../src/rules/engine';
import type { RulesConfig, VitalsData } from '../../src/rules/types';

describe('RulesEngine', () => {
    const testRules: RulesConfig = {
        heart_rate: {
            high_threshold: 120,
            low_threshold: 50,
            persist_samples: 2,
        },
        spo2: {
            low_threshold: 90,
            persist_samples: 1,
        },
    };

    let engine: RulesEngine;

    beforeEach(() => {
        engine = new RulesEngine(testRules, 600000);
    });

    describe('Heart Rate Thresholds', () => {
        it('should not alert on normal heart rate', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-1',
                heart_rate: 75,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);
        });

        it('should alert on high heart rate after persist_samples', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-2',
                heart_rate: 130,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            // First violation - should not alert yet
            let result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);

            // Second violation - should alert
            result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(true);
            expect(result.severity).toBeDefined();
            expect(result.reasons).toHaveLength(1);
            expect(result.reasons![0].code).toBe('HEART_RATE_HIGH');
        });

        it('should alert on low heart rate after persist_samples', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-3',
                heart_rate: 40,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            // First violation
            let result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);

            // Second violation
            result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(true);
            expect(result.reasons![0].code).toBe('HEART_RATE_LOW');
        });

        it('should reset violation count when value returns to normal', () => {
            const patientId = 'patient-4';

            // First violation
            let vitals: VitalsData = {
                patient_id: patientId,
                heart_rate: 130,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };
            let result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);

            // Return to normal - resets count
            vitals = { ...vitals, heart_rate: 75 };
            result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);

            // High again - count restarts
            vitals = { ...vitals, heart_rate: 130 };
            result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);
        });
    });

    describe('SpO2 Thresholds', () => {
        it('should alert immediately on low SpO2 (persist_samples=1)', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-5',
                heart_rate: 75,
                oxygen_saturation: 85,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(true);
            expect(result.reasons![0].code).toBe('SPO2_LOW');
        });

        it('should not alert on normal SpO2', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-6',
                heart_rate: 75,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.shouldAlert).toBe(false);
        });
    });

    describe('Severity Calculation', () => {
        it('should return high severity for multiple violations', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-7',
                heart_rate: 130,
                oxygen_saturation: 85,
                timestamp: new Date().toISOString(),
            };

            // First sample
            engine.evaluate(vitals);
            // Second sample - both violations persist
            const result = engine.evaluate(vitals);

            expect(result.shouldAlert).toBe(true);
            expect(result.severity).toBe('high');
            expect(result.reasons!.length).toBeGreaterThan(1);
        });

        it('should return high severity for critical SpO2', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-8',
                heart_rate: 75,
                oxygen_saturation: 80,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.severity).toBe('high');
        });

        it('should return medium severity for moderate SpO2', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-9',
                heart_rate: 75,
                oxygen_saturation: 88,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.severity).toBe('medium');
        });

        it('should return low severity for minor violations', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-10',
                heart_rate: 122,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            engine.evaluate(vitals);
            const result = engine.evaluate(vitals);
            expect(result.severity).toBe('low');
        });
    });

    describe('Suggested Actions', () => {
        it('should provide appropriate action for critical SpO2', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-11',
                heart_rate: 75,
                oxygen_saturation: 80,
                timestamp: new Date().toISOString(),
            };

            const result = engine.evaluate(vitals);
            expect(result.suggestedAction).toContain('oxygen');
            expect(result.suggestedAction).toContain('physician');
        });

        it('should provide action for multiple violations', () => {
            const vitals: VitalsData = {
                patient_id: 'patient-12',
                heart_rate: 145,
                oxygen_saturation: 85,
                timestamp: new Date().toISOString(),
            };

            engine.evaluate(vitals);
            const result = engine.evaluate(vitals);
            expect(result.suggestedAction).toContain('Immediate');
        });
    });

    describe('State Management', () => {
        it('should track patient states independently', () => {
            const vitals1: VitalsData = {
                patient_id: 'patient-a',
                heart_rate: 130,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            const vitals2: VitalsData = {
                patient_id: 'patient-b',
                heart_rate: 75,
                oxygen_saturation: 98,
                timestamp: new Date().toISOString(),
            };

            // Patient A first violation
            engine.evaluate(vitals1);
            // Patient B normal
            engine.evaluate(vitals2);
            // Patient A second violation - should alert
            const result = engine.evaluate(vitals1);

            expect(result.shouldAlert).toBe(true);
            expect(engine.getTrackedPatientsCount()).toBe(2);
        });
    });
});
