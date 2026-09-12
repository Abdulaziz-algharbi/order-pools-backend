# OrderPools Backend

## Project

OrderPools is a B2B group-buying platform. Retailers who cannot individually purchase a supplier's wholesale quantity join an order pool together. A supplier provides a wholesale product offer, retailers join the pool, and once the required quantity/conditions are met, the order proceeds to fulfillment and distribution.

Three user roles:

- **Retailer** — joins pools and purchases products.
- **Supplier** — provides products/offers and fulfills successful orders.
- **Admin** — manages and controls the platform, including supplier offers and operational workflows.

See `docs/project-scope.md` for the domain model and entity relationships, `docs/tech-stack.md` for stack and conventions, `docs/implementation-plan.md` for a high-level status summary, and `docs/unimplemented-features.md` for the current, detailed gap analysis (the one most worth checking before assuming a feature is or isn't there).

## Development Context

This is an existing backend project, not a greenfield project. Auth/role coverage, Zod validation, and the core pool/payment/delivery business logic are now largely built out (see `docs/unimplemented-features.md` for the current, verified state) — but coverage is still uneven service-by-service and route-by-route, so don't assume auth, validation, or a particular business rule exists for a given route just because a similar-looking one exists elsewhere — check the specific route/controller.

Before implementing a feature:

1. Inspect the relevant existing code.
2. Understand the existing architecture and conventions (below).
3. Reuse existing patterns where appropriate.
4. Make the smallest coherent change required.
5. Do not unnecessarily rewrite or restructure working code.

The existing source code is the source of truth for the current implementation. Treat the docs in `docs/` as a snapshot to verify against the code, not as ground truth on their own — each doc's own header states when it was last verified against `src/` (most recently 2026-09-12) and they can drift after that.

## Architecture Conventions

- **Service module layout**: each domain lives in `src/services/<name>/` with `<name>.model.ts` (Mongoose schema + `couldBeUpdated` whitelist for patch fields), `<name>.controller.ts`, `<name>.routes.ts`, optionally `<name>.schema.ts` (Zod), and an `index.ts` that exports `{ controller, routes, model }`. Wire new services into `src/routes/api/v1/index.ts`.
- **BaseController** (`src/services/base/base.controller.ts`): generic `create/list/getById/update/delete`. `update` only writes fields listed in the model's `couldBeUpdated` array. Most controllers currently just extend it with no overrides — custom business logic (state transitions, aggregation, side effects) goes in a subclass method, not in routes.
- **Cross-service model access**: a controller that needs another service's model imports it directly (e.g. `pool.controller.ts` imports `userModel`, `productOfferModel`, `paymentModel`, `poolParticipantModel`). This is safe because every model file only ever imports `mongoose`/`bcrypt` and never another service, so none of these imports can form a load-time cycle. Do not introduce a service-locator/registry indirection for this — direct imports are the convention.
- **AppRegistry** (`src/app.registry.ts`): singleton service locator (`appRegistry.register(name, instance)` / `.get(name)`), with names in `src/constants/REGISTRY.ts`. Currently unused (empty `REGISTRY`) — kept only as an escape hatch for a future case where a direct import would form an actual circular require. Don't register anything here unless that's genuinely the case.
- **AppBroker** (`src/app.broker.ts`): a Node `EventEmitter` wrapper for cross-service pub/sub (e.g. `auth` emits `user:registered`, `emails` listens via a controller `listeners()` hook called from `BaseController`'s constructor).
- **Validation**: Zod schemas passed through `validate(schema, 'body' | 'query' | 'params')` (`src/middlewares/validate.middleware.ts`, built on `zod-express-middleware`) as route-level middleware. Only `auth`, `users`, and `addresses` currently have schemas wired up — most services accept unvalidated `req.body`.
- **Auth**: `tokenMiddleware` (`src/middlewares/token.middleware.ts`) verifies a JWT access token and sets `req.meta.user.userId`; it does **not** check or attach role. Refresh tokens are persisted per-user in the `Auth` model. Most routes do not apply `tokenMiddleware` at all yet — see `docs/implementation-plan.md` for the list of gaps before treating any route as access-controlled.
- **Errors**: `BaseController.errorHandler` maps `ERRORS` enum values (`src/constants/ERRORS.ts`) thrown as `Error(message)` to HTTP status codes. Extend the enum rather than inventing ad hoc error strings.
- **Logging**: `winston` logger (`src/logger/logger.ts`) via `this.logger` on controllers; `morgan('dev')` for HTTP access logs.

## Important Principles

- Business logic belongs in the appropriate service/domain layer (controller subclass), not scattered in routes.
- Validate external input with Zod at the route boundary.
- Enforce authentication and authorization on the backend — do not trust user IDs or roles supplied by the client when they can be derived from the authenticated session.
- Protect data integrity when an operation touches multiple related documents (e.g. joining a pool touches `PoolParticipant`, `Pool.currentQuantity`, and `Payment`). Real Mongoose transactions are already used in a few specific, multi-document write paths — `PoolController.expirePool()` and `PaymentController.confirmPaymentById()`/`confirmRefund()` — backed by local Mongo running as a single-node replica set (`docker-compose.yml`) specifically so `session.withTransaction()` works. The pool-join guard is deliberately *not* transactional (a single-document atomic `findOneAndUpdate` instead) because an external Thawani HTTP call sits in the middle of that flow, and a DB transaction must never stay open across an external network round trip. Don't assume a new multi-document write is automatically covered by this pattern — add a transaction (or the atomic single-document equivalent, if an external call is involved) deliberately for each new case.
- Follow the project's existing TypeScript, Mongoose, Express, validation, and error-handling conventions above.
- A Jest suite exists (`npm test`, `tests/`, mirroring `src/services/`) — don't claim something was tested unless you actually ran it; run `npm run build` / `npx tsc --noEmit`, `npx eslint .`, and `npm test` where relevant. As of this writing the suite is 507/507 passing — re-run it yourself rather than assuming that's still current.

## How to Work

1. First inspect the relevant code and understand how the existing system works.
2. Identify the files and components that need to change.
3. If the feature conflicts with existing architecture or business rules, explain the issue before making a major change.
4. Implement the feature consistently with the existing codebase.
5. Run the relevant tests/type checks/build checks when available (`npm run build`, `npx tsc --noEmit`, `npx eslint .`, `npm test`).
6. Summarize what changed and any assumptions or concerns.

Do not invent architecture when the existing code already provides an appropriate pattern. Do not claim that something was tested unless it was actually tested.

## Commands

```
npm run dev      # ts-node-dev on src/server.ts
npm run build     # tsc -> dist/
npm run start     # node dist/app.js (run build first)
npm test          # jest
npm run seed:admins   # seed admin accounts from SEED_ADMIN_*_EMAIL/PASSWORD env vars
docker-compose up -d mongo mongo-express   # local Mongo (single-node replica set) + admin UI
```
