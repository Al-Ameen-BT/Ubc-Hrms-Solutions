# Security & Production Hardening Walkthrough

This document outlines the security improvements, containerization assets, and production guardrails implemented for the UCB HRMS platform in alignment with [`skill/production_build_policy.md`](file:///home/ameen/Desktop/HRMS/ucb-hrms/skill/production_build_policy.md).

---

## 1. Summary of Changes

### 1.1 Vulnerability Remediation
- **`nodemailer` Upgrade**: Upgraded `nodemailer` to the latest secure release to address 15 critical/high security advisories (SMTP command injection, full-response SSRF, and CRLF header injection).

### 1.2 Ingress & Traffic Management (Protocol 1)
- **Global API Rate Limiting**: Added sliding-window rate limiting on all `/api/v1` routes (`600 requests per 15 minutes` per IP) in [`src/server.js`](file:///home/ameen/Desktop/HRMS/ucb-hrms/src/server.js#L121-L129) alongside existing sensitive endpoint limiters (login, MFA, password reset).

### 1.3 Distributed Tracing & Observability (Protocol 60)
- **Correlation ID Middleware**: Attached `X-Request-Id` UUID generation to all incoming requests, stamped on `res` headers and request context for end-to-end log correlation.

### 1.4 Production Probes & Guardrails (Protocols 56, 57, 67)
- **Standardized Probes**:
  - `/healthz`: Liveness probe reporting process vitality.
  - `/ready`: Readiness probe verifying database connectivity and dialect health.
- **Production Secret Validation**: Added `enforceProductionGuards()` in [`src/server.js`](file:///home/ameen/Desktop/HRMS/ucb-hrms/src/server.js#L416-L435) to fail fast on startup if `NODE_ENV=production` is run with missing, short (<32 chars), or default placeholder `JWT_SECRET`s.
- **Setup Route Lockdown**: Automatic disabling of `/admin/setup/*` endpoints in production mode unless explicitly opted in via `ALLOW_PROD_SETUP`.

### 1.5 Podman Containerization (Protocols 7, 8)
- **Rootless Multi-Stage `Containerfile` / `Dockerfile`**:
  - **Stage 1 (Frontend Builder)**: Compiles React console using `node:20-alpine`.
  - **Stage 2 (Deps)**: Installs production-only dependencies.
  - **Stage 3 (Runner)**: Minimal runner executed strictly as unprivileged `USER node` (UID 1000) with container health checks (`wget http://localhost:3000/healthz`).
- **`docker-compose.yml`**: Full stack definition compatible with `podman-compose` running both the HRMS container and a health-checked MySQL 8 database.
- **`.containerignore`**: Clean build context excluding `.git`, `node_modules`, local `.sqlite` files, and `.env` credentials.

---

## 2. Verification Results

| Test Scenario | Command | Result |
| :--- | :--- | :--- |
| **Production JWT Guard (Insecure Secret)** | `NODE_ENV=production JWT_SECRET=insecure node -e "require('./src/server')"` | **FAILED FAST (Expected)**: `CRITICAL SECURITY FAILURE: JWT_SECRET must be at least 32 characters` |
| **Production JWT Guard (Placeholder Secret)** | `NODE_ENV=production JWT_SECRET=local-test-jwt-secret... node -e "require('./src/server')"` | **FAILED FAST (Expected)**: Placeholder rejected |
| **Liveness & Readiness Probes** | `GET /healthz` & `GET /ready` | **HTTP 200 OK** |
| **Correlation ID Header** | `GET /healthz` | **`X-Request-Id: 2c34d2d2-1f61-46bf-83d8-543abda268f1` returned** |
| **Frontend Production Build** | `npm run build --prefix frontend` | **0 errors, built in 997ms** |
| **Nodemailer Transport** | `nodemailer.createTransport` test | **OK** |
