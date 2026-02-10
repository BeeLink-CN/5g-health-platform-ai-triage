import { createServer, IncomingMessage, ServerResponse } from 'http';
import { logger } from '../config/logger.js';
import { NatsClient } from '../nats/connection.js';
import { Metrics } from '../metrics/counter.js';
import { RulesEngine } from '../rules/engine.js';

export class ApiServer {
    private server;

    constructor(
        private port: number,
        private natsClient: NatsClient,
        private metrics: Metrics,
        private rulesEngine: RulesEngine,
    ) {
        this.server = createServer(this.handleRequest.bind(this));
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const { method, url } = req;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (method === 'GET' && url === '/health') {
            this.handleHealth(res);
        } else if (method === 'GET' && url === '/metrics') {
            this.handleMetrics(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    private handleHealth(res: ServerResponse): void {
        const isNatsConnected = this.natsClient.isConnected();
        const status = isNatsConnected ? 'ok' : 'degraded';
        const statusCode = isNatsConnected ? 200 : 503;

        const response = {
            status,
            nats: {
                connected: isNatsConnected,
            },
            timestamp: new Date().toISOString(),
        };

        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }

    private handleMetrics(res: ServerResponse): void {
        const counters = this.metrics.getCounters();
        const trackedPatients = this.rulesEngine.getTrackedPatientsCount();

        const response = {
            ...counters,
            tracked_patients: trackedPatients,
            timestamp: new Date().toISOString(),
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                logger.info({ port: this.port }, 'HTTP API server started');
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                logger.info('HTTP API server stopped');
                resolve();
            });
        });
    }
}
