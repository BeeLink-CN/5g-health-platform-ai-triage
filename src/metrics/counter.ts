export class Metrics {
    private counters = {
        received: 0,
        validated: 0,
        alerts_published: 0,
        dropped_invalid: 0,
        dropped_publish_fail: 0,
    };

    incrementReceived(): void {
        this.counters.received++;
    }

    incrementValidated(): void {
        this.counters.validated++;
    }

    incrementAlertsPublished(): void {
        this.counters.alerts_published++;
    }

    incrementDroppedInvalid(): void {
        this.counters.dropped_invalid++;
    }

    incrementDroppedPublishFail(): void {
        this.counters.dropped_publish_fail++;
    }

    getCounters() {
        return { ...this.counters };
    }

    reset(): void {
        this.counters = {
            received: 0,
            validated: 0,
            alerts_published: 0,
            dropped_invalid: 0,
            dropped_publish_fail: 0,
        };
    }
}
