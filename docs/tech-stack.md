# Tech Stack

> Derived from `package.json`, `tsconfig.json`, `docker-compose.yml`, and `src/` on 2026-08-28.

## Runtime & Framework

- **Node.js** + **TypeScript** (`strict: true`, target `ES2020`, CommonJS modules, output to `dist/`).
- **Express 5** (`src/app.ts`) — JSON body parsing, `morgan('dev')` request logging. `cors()` is imported but currently commented out (CORS disabled).
- Entry point: `src/server.ts` (dev, via `ts-node-dev --files --respawn`) / `dist/app.js` (prod, after `npm run build`).

## Database

- **MongoDB** via **Mongoose 9**. Connection helper in `src/db/connect-to-db.ts`. URI resolved from `${APP_MODE}_MONGO_URI` env var (`DEV_MONGO_URI` / `STAGIN_MONGO_URI` [sic, typo in `.env.example`] / `PROD_MONGO_URI`), falling back to `mongodb://localhost:27017/order-pool`.
- Local dev DB via `docker-compose.yml`: `mongo:6` + `mongo-express` admin UI on port 8081 (basic auth `admin`/`passpass` — dev-only credentials, do not reuse anywhere real).
- No transactions/sessions are used anywhere in the codebase yet, despite several operations (pool joins, payouts) needing them.

## Auth

- **jsonwebtoken** for access + refresh tokens (`src/utils/jwt.util.ts`), **bcrypt** for password hashing (`User` pre-save hook).
- Access token secret/TTL: `JWT_TOKEN_SECRET` / `JWT_TOKEN_TTL` (default `1h`). Refresh: `JWT_REFRESH_TOKEN_SECRET` / `JWT_REFRESH_TOKEN_TTL` (default `7d`).
- Refresh tokens are persisted per-user in the `Auth` collection (upserted on login, created on register). `POST /auth/refresh` does not rotate/invalidate the stored refresh token — it only re-signs a new access token from the decoded refresh token payload.
- `tokenMiddleware` (`src/middlewares/token.middleware.ts`) verifies the access token and sets `req.meta.user.userId`. It does not read or attach `role`, and there is no role-based authorization middleware yet.

## Validation

- **Zod 4** schemas + **zod-express-middleware**'s `validateRequest`, wrapped by `validate(schema, 'body'|'query'|'params')` in `src/middlewares/validate.middleware.ts`. Applied per-route as Express middleware before the controller.
- Schemas currently exist only for `auth` (register), `users` (create), and `addresses` (create) — other services accept raw, unvalidated `req.body`.

## Email

- **nodemailer** (`src/services/emails/emails.controller.ts`), SMTP configured via `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` env vars (not yet in `.env.example`, which only lists `PORT`/`APP_MODE`/Mongo/JWT vars).
- Sends are logged to the `Email` collection, which auto-expires documents after 7 days via a TTL index.
- Decoupled from `auth` via the in-process event broker: `auth` emits `user:registered`, `emails` listens (`listeners()` hook, called automatically by `BaseController`'s constructor if a subclass defines it) and sends a verification email built from `emailsController.createVerificationLink`.

## Logging

- **winston** (`src/logger/logger.ts`): console transport, plus `logs/error.log` and `logs/combined.log` file transports. Debug level in `DEV` app mode, info otherwise. Exposed to controllers as `this.logger` via `BaseController`.

## Cross-Cutting Patterns (see `CLAUDE.md` for detail)

- `AppRegistry` (`src/app.registry.ts`) — singleton service locator for cross-service lookups without circular imports.
- `AppBroker` (`src/app.broker.ts`) — Node `EventEmitter` wrapper for pub/sub between services. This is the current (lightweight) substitute for the Redis/BullMQ/MQTT infra mentioned in `README.md` but not yet installed.
- `BaseController` (`src/services/base/base.controller.ts`) — generic CRUD (`create/list/getById/update/delete`) that every service controller extends, plus a shared `errorHandler` keyed off `src/constants/ERRORS.ts`.

## Tooling

- **ESLint** (flat config, `eslint.config.mts`) + **Prettier**, run via **husky** pre-commit hook + **lint-staged** (`**/*.{js,ts}` -> `eslint --fix` then `prettier --write`).
- **No test runner is configured.** `tsconfig.json` includes `tests/**/*.ts` and `**/*.test.ts`/`**/*.spec.ts` in its `include`, and lists `jest` in `compilerOptions.types`, but there is no `jest` (or other test framework) dependency in `package.json`, no `tests/` directory, and no `npm test` script. Treat "run the tests" as not currently possible until a test setup is added — confirm with the user before assuming one exists.
- `.http` request files under `http/` (one per service, e.g. `http/notifications.http`) are used for manual/REST-client-style API testing — follow that convention for new services (e.g. `<service>.http`) rather than adding a different manual-testing format.

## Environment Variables (`.env.example`)

```
PORT=
APP_MODE=            # DEV | STAGING | PROD
DEV_MONGO_URI=
STAGIN_MONGO_URI=    # note: typo, not "STAGING"
PROD_MONGO_URI=
JWT_TOKEN_SECRET=
JWT_REFRESH_TOKEN_SECRET=
JWT_TOKEN_TTL=
JWT_REFRESH_TOKEN_TTL=
```

`src/config/config.ts` also reads `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (optional, undefined if unset) and `emails.controller.ts` reads `SMTP_FROM` directly from `process.env` — none of these SMTP vars are documented in `.env.example` yet.

## Scripts (`package.json`)

```
npm run dev      # ts-node-dev --files --respawn src/server.ts
npm run build     # npx tsc
npm run start     # node ./dist/app.js  (run build first)
npm run prepare   # npx husky (git hook install)
```
