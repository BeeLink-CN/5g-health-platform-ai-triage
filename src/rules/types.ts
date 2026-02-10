export interface VitalsData {
    patient_id: string;
    heart_rate: number;
    oxygen_saturation: number;
    timestamp: string;
}

export interface ThresholdRule {
    high_threshold?: number;
    low_threshold?: number;
    persist_samples?: number;
}

export interface RulesConfig {
    heart_rate?: ThresholdRule;
    spo2?: ThresholdRule;
}

export type Severity = 'low' | 'medium' | 'high';

export interface AlertReason {
    code: string;
    message: string;
}

export interface AlertResult {
    shouldAlert: boolean;
    severity?: Severity;
    reasons?: AlertReason[];
    suggestedAction?: string;
}

export interface PatientState {
    patientId: string;
    violations: {
        heart_rate_high?: number;
        heart_rate_low?: number;
        spo2_low?: number;
    };
    lastUpdated: number;
}
