# SAMS Academic Complaints & AI Dispatch Portal - Backend API

> **Backend Service:** `sams-complaints-system-backend-nest`  
> **Technology Stack:** NestJS 12, MongoDB (Mongoose 9), JWT (Bearer Tokens), Vitest

## Overview

Enterprise backend service for the **Sadat Academy for Management Sciences (SAMS)** Academic Complaints & AI Dispatch Portal. Provides robust complaint ticket lifecycle management, advisory AI microservice orchestration via Transactional Outbox pattern, branch/department query scoping, and role-based access control (RBAC).

## Architecture & Key Modules

```
src/
├── admins/         # Administrative accounts, schemas, seed scripts, and roles
├── ai/             # AI bridge service and outbox consumer worker with advisory invariance
├── analytics/      # Executive BI aggregations, SLA metrics, and UTF-8 BOM CSV export
├── auth/           # JWT authentication, login DTOs, guards, and strategies
├── branches/       # Dynamic branch entities and administrative management
├── departments/    # Dynamic department entities assigned to branches
├── common/         # Tenancy and branch-scoping query utilities
├── outbox/         # Transactional Outbox pattern, claiming, and reconciliation cron
├── tickets/        # Ticket CRUD, cryptographic code generator, and status management
├── app.controller.ts # Root controller with / and /health endpoints
├── app.module.ts   # Root dependency injection and configuration wiring
└── main.ts         # Bootstrap entrypoint with class-validator validation pipe and CORS
```

## Security & Architectural Standards

- **Cryptographic Ticket Identifiers:** High-entropy random hexadecimal ticket numbers generated upon submission (`TCK-...`).
- **Advisory AI Only:** Zero automated authority; AI microservice outputs provide recommendations for human dispatchers while strictly preserving status invariance.
- **Transactional Outbox:** Guaranteed decoupled event persistence with standalone MongoDB fallback and reconciliation recovery.
- **Stateless Bearer JWT:** Single token lifecycle with MongoDB TTL revocation tracking.
- **Data Scoping Matrix:** Multi-branch administrative isolation enforced at the service query layer.
- **Executive BI & Analytics:** Native MongoDB aggregation pipelines and Excel-compatible UTF-8 BOM CSV exports.

## Environment Setup

1. Copy the sample environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure required environment variables in `.env`:
   - `PORT`: Service port (default: `5000`)
   - `MONGODB_URI`: MongoDB connection string (with replica set `rs0` for transactions)
   - `JWT_SECRET`: Minimum 32-character secure secret
   - `SUPER_ADMIN_*`: Credentials for initial system administrator seed
   - `AI_SUMMARIZE_URL`: URL for Model 1 Arabic summarizer (`http://localhost:8000/summarize`)
   - `AI_CLASSIFY_ROUTE_URL`: URL for Model 2 classifier (`http://localhost:8000/classify-route`)

## Local Development & Testing

```bash
# Install dependencies
npm install

# Start in development watch mode
npm run start:dev

# Run full test suite (129 unit & multi-tenant workflow tests across 20 suites)
npm run test

# Run e2e HTTP integration tests
npm run test:e2e

# Run Oxlint fast linter
npm run lint

# Build for production
npm run build

# Start production build
npm run start:prod
```

## Production Docker Deployment

```bash
# Build production Docker image
docker build -t sams-backend .

# Run container with health check on port 5000
docker run -d -p 5000:5000 --name sams-backend sams-backend
```

