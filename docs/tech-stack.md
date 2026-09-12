# Tech Stack

> Derived from `package.json`, `tsconfig.json`, `docker-compose.yml`, `Dockerfile`, and `src/` on 2026-09-12. This is a snapshot — re-verify against the code before relying on it for anything load-bearing.

## Runtime & Framework

- **Node.js** + **TypeScript** (`strict: true`, target `ES2020`, CommonJS modules, output to `dist/`).
- **Express 5** (`src/app.ts`) — JSON body parsing, `morgan('dev')` request logging, `cors({ origin: config.frontendUrl })` (CORS is enabled, scoped to a single configured frontend origin — not wide open).
- Entry point: `src/server.ts` (dev, via `ts-node-dev --files --respawn`) / `dist/src/server.js` (prod, after `npm run build`).

## Database

- **MongoDB** via **Mongoose 9**. Connection helper in `src/db/connect-to-db.ts`. URI resolved from `${APP_MODE}_MONGO_URI` env var (`DEV_MONGO_URI` / `STAGIN_MONGO_URI` [sic, typo in `.env.example`] / `PROD_MONGO_URI`), falling back to `mongodb://localhost:27017/order-pool?replicaSet=rs0&directConnection=true`.
- Local dev DB via `docker-compose.yml`: `mongo:6` running as a **single-node replica set** (`--replSet rs0`, initiated once by a one-shot `mongo-init` service) + `mongo-express` admin UI on port 8081 (basic auth `admin`/`passpass` — dev-only credentials, do not reuse anywhere real). The replica set (not a standalone `mongod`) is what makes Mongoose sessions/transactions possible at all — see `.env.example` for why client URIs need both `replicaSet` and `directConnection` query params.
- Mongoose sessions/transactions are used in `PoolController.expirePool()` (cancel + Payment/PoolParticipant sweep) and `PaymentController.confirmPaymentById()`/`confirmRefund()` (Payment status flip + its PoolParticipant status flip). The pool-join guard still deliberately uses a single-document atomic `findOneAndUpdate` instead (an external Thawani call sits in the middle of that flow, and a DB transaction must never stay open across an external HTTP round trip). The Pool/PoolParticipant/SupplierPayout lifecycle-status syncs triggered from `deliveries.controller.ts`/`supplier.payouts.controller.ts` are deliberately non-transactional, logged-best-effort secondary writes, not a data-integrity gap by omission — see `docs/unimplemented-features.md` §11.

## Auth & Authorization

- **jsonwebtoken** for access + refresh tokens (`src/utils/jwt.util.ts`), **bcrypt** for password hashing (`User` pre-save hook).
- Access token secret/TTL: `JWT_TOKEN_SECRET` / `JWT_TOKEN_TTL` (default `1h`). Refresh: `JWT_REFRESH_TOKEN_SECRET` / `JWT_REFRESH_TOKEN_TTL` (default `7d`). The JWT payload carries `{ _id, roles }`.
- Refresh tokens are persisted per-user in the `Auth` collection (upserted on login, created on register). `POST /auth/refresh` checks the presented refresh token against the value persisted in `Auth` and rejects it if they've diverged (e.g. after `POST /auth/logout`, which clears the stored value) — it does not rotate the stored token on a successful refresh, and there is no access-token blacklist (a still-valid access token keeps working until it naturally expires).
- `tokenMiddleware` (`src/middlewares/token.middleware.ts`) verifies the access token and sets `req.meta.user = { userId, roles }` — it **does** read and attach roles from the token. `optionalTokenMiddleware` (`src/middlewares/optional-token.middleware.ts`) does the same but leaves `req.meta.user` unset (rather than 401ing) when no/invalid token is presented, for routes with public-but-role-aware access (e.g. `GET /pools`). `requireRole(...roles)` (`src/middlewares/require-role.middleware.ts`) 401s with no authenticated user, 403s unless at least one of the caller's roles overlaps the allowed list.
- Auth/role coverage is now applied across essentially every route module (with controller-level ownership checks layered on top where needed) — see `docs/unimplemented-features.md` §1/§11 for the current, verified per-route breakdown and its one deliberate exception (the Thawani webhook).

## Validation

- **Zod 4** schemas + **zod-express-middleware**'s `validateRequest`, wrapped by `validate(schema, 'body'|'query'|'params')` in `src/middlewares/validate.middleware.ts`. Applied per-route as Express middleware before the controller.
- A `*.schema.ts` exists and is wired up via `validate()` for essentially every service: `auth`, `users`, `addresses`, `product.offers`, `pools`, `pool.participants`, `complaints`, `deliveries`, `notifications`, `supplier.payouts`, `supplier.requests`, `supplier.remove.requests`. The two exceptions are deliberate, not gaps: `payments` has no schema because it has no client-supplied-body route at all (every transition is a parameterless `POST /:id/<action>`), and the Thawani webhook route accepts Thawani's own payload shape, which isn't ours to validate.

## Payments

- **Thawani** (`https://thawani.om`, an Oman-only hosted-checkout gateway) is the sole payment provider — Stripe was considered early on but is not used. `src/services/thawani/thawani.gateway.ts` wraps checkout-session creation/lookup and refund request/lookup; amounts on the wire are always baisa (1 OMR = 1000 baisa).
- `THAWANI_SECRET_KEY` (server-side only) / `THAWANI_PUBLISHABLE_KEY` (embedded in the checkout redirect URL) / `THAWANI_API_BASE_URL` / `THAWANI_CHECKOUT_BASE_URL` (both default to Thawani's UAT/sandbox host).
- `src/services/webhooks/thawani.webhook.controller.ts` is an intentionally unauthenticated callback endpoint (`POST /api/v1/webhooks/thawani`) — the payload is never trusted for anything beyond which `Payment` to re-check; the real state change always comes from a fresh authenticated call back to Thawani.
- See `docs/unimplemented-features.md` §1b for the full breakdown of what's implemented vs. still missing (e.g. no webhook signature verification).

## Email

- **nodemailer** (`src/services/emails/emails.controller.ts`), SMTP configured via `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` env vars.
- Sends are logged to the `Email` collection, which auto-expires documents after 7 days via a TTL index.
- Decoupled from `auth` via the in-process event broker: `auth` emits `user:registered`, `emails` listens (`listeners()` hook, called automatically by `BaseController`'s constructor if a subclass defines one) and sends a verification email built from `emailsController.createVerificationLink`.

## Logging

- **winston** (`src/logger/logger.ts`): console transport, plus `logs/error.log` and `logs/combined.log` file transports. Debug level in `DEV` app mode, info otherwise. Exposed to controllers as `this.logger` via `BaseController`.

## Cross-Cutting Patterns (see `CLAUDE.md` for detail)

- `BaseController` (`src/services/base/base.controller.ts`) — generic CRUD (`create/list/getById/update/delete`) that every service controller extends, plus a shared `errorHandler` keyed off `src/constants/ERRORS.ts`, and opt-in `?page`/`?limit` pagination in `list()` via a `buildListFilter()`/`listSelect()`/`transformListDoc()` hook set every subclass can override.
- `AppBroker` (`src/app.broker.ts`) — Node `EventEmitter` wrapper for pub/sub between services (`src/constants/EVENTS.ts`: `DELIVERY_ASSIGNED`, `DELIVERY_COMPLETED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`). This is the current (lightweight) substitute for the Redis/BullMQ/MQTT infra mentioned in `README.md` but not yet installed.
- `AppRegistry` (`src/app.registry.ts`) — a singleton service-locator escape hatch (`appRegistry.register(name, instance)` / `.get(name)`, names in `src/constants/REGISTRY.ts`) for a cross-service dependency that can't be a direct import without forming an actual circular require. **Currently unused** (`REGISTRY` is an empty object) — every cross-service model access today is a direct import (e.g. `pool.controller.ts` importing `userModel`/`productOfferModel`/`paymentModel`/`poolParticipantModel` directly), because none of those imports actually forms a load-time cycle. Don't reach for this by default; direct imports are the convention.

## Testing

- **Jest 30** (`ts-jest` preset) is fully configured — `jest.config.js` (roots at `tests/`, `tests/env.setup.ts` seeds deterministic JWT env vars before any module reads `process.env`), `npm test` script, `jest`/`ts-jest`/`@types/jest` in `devDependencies`.
- 35 test files under `tests/`, mirroring `src/services/*` 1:1 (`<name>.controller.test.ts` + `<name>.routes.test.ts` per service), plus `tests/middlewares/*` and one cross-service `delivery-notification.integration.test.ts`.
- No `supertest` and no `mongodb-memory-server` — nothing spins up a real HTTP server or a real Mongo. `*.controller.test.ts` files unit-test controller methods directly against `jest.mock()`ed Mongoose models (and mocked `mongoose.startSession()` for transactional methods) with hand-built `Request`/`Response` objects. `*.routes.test.ts` files introspect the real registered Express `Router`'s `.stack` to invoke an individual middleware (typically the `requireRole` gate) directly, proving the actual route wiring without a network layer. `delivery-notification.integration.test.ts` is the one exception that wires the real singleton controllers together through the real `AppBroker`.
- As of this writing: `npx tsc --noEmit` is clean, `npx eslint .` reports 0 errors (12 pre-existing `no-console` warnings, all in `scripts/seed-admins.ts`/`src/db/connect-to-db.ts`/`src/server.ts` — bootstrap code that legitimately logs to the console before the winston logger is relevant), and `npx jest` reports **35 suites / 507 tests, all passing**. Re-run `npm test` yourself before relying on that — it has regressed before (see `docs/unimplemented-features.md`'s 2026-09-12 note for an example: a controller change landed without updating that test file's mocks, briefly leaving 7 tests failing until fixed).
- `.http` request files under `http/` (one per service, e.g. `http/notifications.http`, plus `http/00-smooth-flow.http` — a full scripted retailer/supplier/admin lifecycle including a real Thawani UAT checkout) are used for manual, REST-client-style API testing against a running server — follow that convention for new services rather than adding a different manual-testing format.

## Containerization & Deployment

- `Dockerfile` — multi-stage build: `build` stage (`node:26-alpine`, `npm ci`, `npm run build`) produces `dist/`; `runtime` stage (`node:26-alpine`, `npm ci --omit=dev`) copies only `dist/` and runs `node dist/src/server.js`, with a `HEALTHCHECK` hitting `GET /ping`.
- `docker-compose.yml` defines: `mongo` (single-node replica set, host port `27017` published for the native, non-Docker dev workflow too), `mongo-init` (one-shot replica-set initiation), `mongo-express` (admin UI, port `8081`), `backend` (built from this repo's `Dockerfile`, no host port published — only reachable from `nginx` on the internal network at `backend:8000`; `DEV_MONGO_URI`/`FRONTEND_URL` are overridden here to the in-network values), and `nginx` (TLS termination + static frontend + reverse proxy to `backend`, built from the sibling `../order-pools-app` repo, ports `80`/`443`, requires a dev cert first via `certs/generate-dev-certs.sh`).
- **Local dev vs. real deployment gap worth knowing:** the Thawani webhook (`POST /api/v1/webhooks/thawani`) can only be called by Thawani's real servers over the public internet — under local `docker-compose up`, `nginx` only terminates TLS at `https://localhost` with a self-signed dev cert, which Thawani cannot reach. In local dev, payment reconciliation happens only via the retailer's own `POST /payments/:id/confirm` (triggered by landing on `success_url`); the webhook path only becomes live once deployed behind a real public domain with a valid certificate, registered in the Thawani merchant dashboard.

## Tooling

- **ESLint** (flat config, `eslint.config.mts`) + **Prettier**, run via **husky** pre-commit hook + **lint-staged** (`**/*.{js,ts}` -> `eslint --fix` then `prettier --write`).

## Environment Variables (`.env.example`)

```
PORT=
APP_MODE=            # DEV | STAGING | PROD

DEV_MONGO_URI=mongodb://localhost:27017/order-pool?replicaSet=rs0&directConnection=true
STAGIN_MONGO_URI=    # note: typo, not "STAGING"
PROD_MONGO_URI=

FRONTEND_URL=        # frontend origin allowed via CORS; defaults to http://localhost:5173 if unset

JWT_TOKEN_SECRET=
JWT_REFRESH_TOKEN_SECRET=
JWT_TOKEN_TTL=
JWT_REFRESH_TOKEN_TTL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Thawani (https://thawani.om) — Oman payment gateway used for pool contributions.
# Defaults point at the UAT/sandbox host.
THAWANI_SECRET_KEY=
THAWANI_PUBLISHABLE_KEY=
THAWANI_API_BASE_URL=https://uatcheckout.thawani.om/api/v1
THAWANI_CHECKOUT_BASE_URL=https://uatcheckout.thawani.om

# used only by `npm run seed:admins` — never read by the running app.
SEED_ADMIN_1_EMAIL=
SEED_ADMIN_1_PASSWORD=
SEED_ADMIN_2_EMAIL=
SEED_ADMIN_2_PASSWORD=
```

## Scripts (`package.json`)

```
npm run dev          # ts-node-dev --files --respawn src/server.ts
npm run build         # npx tsc
npm run start         # node ./dist/src/server.js  (run build first)
npm test              # jest
npm run seed:admins   # ts-node --files scripts/seed-admins.ts
npm run prepare       # npx husky (git hook install)
npm run lint-staged   # lint-staged (invoked by the husky pre-commit hook)
```
