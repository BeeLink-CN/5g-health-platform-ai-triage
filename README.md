# 5G Health Platform - AI Triage Service

[![CI](https://github.com/your-org/5g-health-platform-ai-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/5g-health-platform-ai-triage/actions/workflows/ci.yml)

AI-powered triage service that consumes patient vitals from NATS JetStream, evaluates risk using a rules engine, and publishes alerts for abnormal conditions.

## What It Does

The AI Triage Service is a critical component of the 5G Health Platform that:

1. **Consumes** vitals events (`vitals.recorded`) from NATS JetStream
2. **Evaluates** patient vitals against configurable threshold rules
3. **Tracks** violation persistence to reduce false positives
4. **Publishes** patient alerts (`patient.alert.raised`) when risks are detected
5. **Provides** severity levels (low/medium/high) and suggested actions

This is an **MVP implementation** using a rules-based engine, designed to be **ML-ready** for future enhancements.

## Architecture

The service fits into the platform pipeline as follows:

```
Medical Devices & Sensors
          ↓
    IoT Gateway (MQTT)
          ↓
   Ingestion Service
          ↓
   NATS JetStream (vitals.recorded)
          ↓
   ┌──────────────────────┐
   │  AI Triage Service   │  ← This Service
   │  - Schema Validation │
   │  - Rules Engine      │
   │  - Alert Publishing  │
   └──────────────────────┘
          ↓
   NATS JetStream (patient.alert.raised)
          ↓
   Realtime Gateway (WebSocket)
          ↓
   Dashboard / Mobile Apps
```

## Features

- ✅ **Schema Validation**: JSON Schema draft 2020-12 validation using Ajv
- ✅ **Threshold Rules**: Configurable heart rate and SpO2 thresholds
- ✅ **Persistence Checking**: Require N consecutive violations to reduce false positives
- ✅ **State Management**: TTL-based patient state cache with automatic eviction
- ✅ **Smart Retry Logic**: Ack/nak strategy with bounded retries
- ✅ **Observability**: Health and metrics HTTP endpoints
- ✅ **Type Safety**: TypeScript strict mode throughout

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `NATS_STREAM` | `events` | JetStream stream name |
| `NATS_DURABLE` | `ai-triage` | Durable consumer name |
| `CONTRACTS_PATH` | `./contracts` | Path to JSON schemas directory |
| `RULES_PATH` | `./rules/default.json` | Path to rules configuration |
| `STATE_TTL_MS` | `600000` | Patient state TTL (10 min) |
| `HTTP_PORT` | `8092` | HTTP server port |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## Rules Configuration

Rules are defined in a JSON file (default: `./rules/default.json`):

```json
{
  "heart_rate": {
    "high_threshold": 120,
    "low_threshold": 50,
    "persist_samples": 2
  },
  "spo2": {
    "low_threshold": 90,
    "persist_samples": 1
  }
}
```

- `high_threshold` / `low_threshold`: Vitals thresholds
- `persist_samples`: Number of consecutive violations required to trigger an alert

## Alert Event Format

Published alerts follow this structure:

```json
{
  "event_name": "patient.alert.raised",
  "event_id": "uuid",
  "timestamp": "ISO-8601",
  "payload": {
    "patient_id": "uuid",
    "severity": "low | medium | high",
    "reasons": [
      {
        "code": "HEART_RATE_HIGH | HEART_RATE_LOW | SPO2_LOW",
        "message": "Human-readable description"
      }
    ],
    "suggested_action": "Clinical recommendation",
    "vitals_snapshot": {
      "heart_rate": 130,
      "oxygen_saturation": 85,
      "timestamp": "ISO-8601"
    }
  }
}
```

## Quick Start

### Prerequisites

- Node.js >= 18
- NATS Server with JetStream enabled
- Contracts repository (schemas)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/5g-health-platform-ai-triage.git
   cd 5g-health-platform-ai-triage
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up contracts:**
   ```bash
   # Symlink or copy contracts from the contracts repository
   ln -s ../5g-health-platform-contracts/schemas ./contracts
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Start NATS (if not already running):**
   ```bash
   # Using Docker
   docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine -js

   # Or use the infrastructure repository
   cd ../5g-health-platform-infra
   docker-compose up -d nats
   ```

6. **Run the service:**
   ```bash
   npm run dev
   ```

7. **Verify it's running:**
   ```bash
   curl http://localhost:8092/health
   curl http://localhost:8092/metrics
   ```

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t ai-triage:latest .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

   Or integrate with the platform infrastructure:
   ```bash
   cd ../5g-health-platform-infra
   docker-compose --profile ai-triage up -d
   ```

## HTTP Endpoints

### GET /health

Returns service health status including NATS connection.

**Response (200 OK):**
```json
{
  "status": "ok",
  "nats": {
    "connected": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "degraded",
  "nats": {
    "connected": false
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### GET /metrics

Returns operational metrics.

**Response (200 OK):**
```json
{
  "received": 1523,
  "validated": 1520,
  "alerts_published": 42,
  "dropped_invalid": 3,
  "dropped_publish_fail": 0,
  "tracked_patients": 15,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Testing

### Run all tests:
```bash
npm test
```

### Run unit tests only:
```bash
npm run test:unit
```

### Run integration tests:
```bash
# Start NATS first
docker run -d -p 4222:4222 nats:2.10-alpine -js

# Run integration tests
npm run test:integration
```

### Type checking:
```bash
npm run typecheck
```

## Project Structure

```
5g-health-platform-ai-triage/
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment configuration
│   │   └── logger.ts           # Pino logger setup
│   ├── contracts/
│   │   └── schema-validator.ts # Ajv2020 schema validation
│   ├── nats/
│   │   ├── connection.ts       # NATS connection manager
│   │   ├── consumer.ts         # JetStream consumer
│   │   └── publisher.ts        # Alert publisher
│   ├── rules/
│   │   ├── types.ts            # Type definitions
│   │   ├── engine.ts           # Rules evaluation engine
│   │   └── loader.ts           # Rules config loader
│   ├── metrics/
│   │   └── counter.ts          # Metrics tracking
│   ├── api/
│   │   └── server.ts           # HTTP API server
│   └── index.ts                # Application entry point
├── tests/
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
├── rules/
│   └── default.json            # Default rules config
├── contracts/                  # Mounted schemas (from contracts repo)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Message Handling Strategy

The service implements a robust ack/nak strategy:

1. **JSON Parse Error** → ACK (avoid poison message loop) + increment `dropped_invalid`
2. **Schema Validation Failure** → ACK + increment `dropped_invalid`
3. **No Alert Needed** → ACK
4. **Alert Published Successfully** → ACK + increment `alerts_published`
5. **Alert Publish Failure** → NAK with 2s delay + increment `dropped_publish_fail`
   - Retries up to 5 times (configurable via `max_deliver`)
   - After max retries exhausted: automatically ACKed by NATS

## Development

### Adding New Rules

1. Update `rules/default.json` with new thresholds
2. Update `src/rules/types.ts` if adding new rule types
3. Update `src/rules/engine.ts` to evaluate new rules
4. Add tests in `tests/unit/rules/engine.test.ts`

### Adding New Schemas

Schemas are managed in the `5g-health-platform-contracts` repository. Update that repository and remount the contracts directory.

## Production Considerations

- **Scalability**: Deploy multiple instances with different durable consumer names for horizontal scaling
- **Monitoring**: Export metrics to Prometheus or similar monitoring system
- **Alerting**: Set up alerts for high `dropped_invalid` or `dropped_publish_fail` rates
- **State TTL**: Adjust `STATE_TTL_MS` based on patient monitoring frequency
- **NATS Clustering**: Use NATS cluster for high availability

## License

MIT
