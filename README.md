# SAMS Academic Complaints & AI Dispatch Portal - Backend API

> **Backend Service:** `sams-complaints-system-backend-nest`  
> **Technology Stack:** NestJS 12, MongoDB (Mongoose 9), JWT (Bearer Tokens), Vitest

## Overview

Enterprise backend service for the **Sadat Academy for Management Sciences (SAMS)** Academic Complaints & AI Dispatch Portal. Provides robust complaint ticket lifecycle management, advisory AI microservice orchestration via Transactional Outbox pattern, branch/department query scoping, and role-based access control (RBAC).

## Architecture & Key Modules

```
src/
├── admins/         # Administrative accounts, schemas, seed scripts, and roles
├── auth/           # JWT authentication, login DTOs, guards, and strategies
├── branches/       # Dynamic branch entities and administrative management
├── departments/    # Dynamic department entities assigned to branches
├── common/         # Tenancy and branch-scoping query utilities
├── outbox/         # Transactional Outbox pattern, claiming, and reconciliation cron
├── tickets/        # Ticket CRUD, cryptographic code generator, and status management
├── app.module.ts   # Root dependency injection and configuration wiring
└── main.ts         # Bootstrap entrypoint with class-validator validation pipe
```

## Security & Architectural Standards

- **Cryptographic Ticket Identifiers:** High-entropy random hexadecimal ticket numbers generated upon submission (`TCK-...`).
- **Advisory AI Only:** Zero automated authority; AI microservice outputs provide recommendations for human dispatchers.
- **Transactional Outbox:** Guaranteed decoupled event persistence with standalone MongoDB fallback and reconciliation recovery.
- **Stateless Bearer JWT:** Single token lifecycle with MongoDB TTL revocation tracking.
- **Data Scoping Matrix:** Multi-branch administrative isolation enforced at the service query layer.

## Environment Setup

1. Copy the sample environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure required environment variables in `.env`:
   - `PORT`: Service port (default: `3000`)
   - `MONGODB_URI`: MongoDB connection string
   - `JWT_SECRET`: Minimum 32-character secure secret
   - `SUPER_ADMIN_*`: Credentials for initial system administrator seed

## Local Development & Testing

```bash
# Install dependencies
npm install

# Start in development watch mode
npm run start:dev

# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Build for production
npm run build

# Start production build
npm run start:prod
```
