import { loadConfig } from './config/env.js';
import { logger } from './config/logger.js';
import { SchemaValidator } from './contracts/schema-validator.js';
import { loadRules } from './rules/loader.js';
import { RulesEngine } from './rules/engine.js';
import { NatsClient } from './nats/connection.js';
import { VitalsConsumer } from './nats/consumer.js';
import { AlertPublisher } from './nats/publisher.js';
import { Metrics } from './metrics/counter.js';
import { ApiServer } from './api/server.js';

async function main() {
    logger.info('Starting 5G Health Platform AI Triage Service');

    // Load configuration
    const config = loadConfig();
    logger.info({ config }, 'Configuration loaded');

    // Initialize schema validator
    const validator = new SchemaValidator(config.contracts.path);
    validator.loadSchemas();

    // Load rules
    const rules = loadRules(config.rules.path);

    // Initialize rules engine
    const rulesEngine = new RulesEngine(rules, config.state.ttlMs);

    // Initialize metrics
    const metrics = new Metrics();

    // Initialize NATS client
    const natsClient = new NatsClient({
        servers: config.nats.url,
        name: 'ai-triage',
    });

    await natsClient.connect();

    // Initialize alert publisher
    const alertPublisher = new AlertPublisher(
        natsClient,
        validator,
    );

    // Initialize vitals consumer
    const vitalsConsumer = new VitalsConsumer(
        natsClient,
        validator,
        rulesEngine,
        alertPublisher,
        metrics,
        {
            streamName: config.nats.stream,
            durableName: config.nats.durable,
            subject: 'vitals.recorded',
        },
    );

    // Initialize HTTP API server
    const apiServer = new ApiServer(
        config.http.port,
        natsClient,
        metrics,
        rulesEngine,
    );

    // Start HTTP server
    await apiServer.start();

    // Start consuming messages
    vitalsConsumer.start().catch((err) => {
        logger.error({ error: err }, 'Consumer failed');
    });

    logger.info('AI Triage Service running');

    // Graceful shutdown
    const shutdown = async () => {
        logger.info('Shutting down gracefully');

        await apiServer.stop();
        await natsClient.close();

        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    logger.error({ error: err }, 'Fatal error during startup');
    process.exit(1);
});
