import { connect, NatsConnection, ConnectionOptions } from 'nats';
import { logger } from '../config/logger.js';

export class NatsClient {
    private nc: NatsConnection | null = null;
    private connecting = false;

    constructor(private options: ConnectionOptions) { }

    async connect(): Promise<void> {
        if (this.nc || this.connecting) {
            return;
        }

        this.connecting = true;

        try {
            logger.info({ servers: this.options.servers }, 'Connecting to NATS');

            this.nc = await connect(this.options);

            logger.info('Connected to NATS successfully');

            // Handle connection events
            (async () => {
                if (!this.nc) return;

                for await (const status of this.nc.status()) {
                    logger.info({ type: status.type, data: status.data }, 'NATS status update');
                }
            })();

        } catch (err) {
            logger.error({ error: err }, 'Failed to connect to NATS');
            throw err;
        } finally {
            this.connecting = false;
        }
    }

    getConnection(): NatsConnection {
        if (!this.nc) {
            throw new Error('NATS connection not established');
        }
        return this.nc;
    }

    isConnected(): boolean {
        return this.nc !== null && !this.nc.isClosed();
    }

    async close(): Promise<void> {
        if (this.nc) {
            logger.info('Closing NATS connection');
            await this.nc.drain();
            this.nc = null;
        }
    }
}
