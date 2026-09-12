# Implementation Status & Plan

> A high-level status summary from inspecting `src/` on 2026-09-12 — not a document the team wrote in advance. This is a snapshot to re-verify against the code before relying on it; for a detailed, route-by-route gap analysis (not just a summary), see `docs/unimplemented-features.md`, which is maintained in more depth and detail than this file.

## Done

- Mongoose models for every core entity (`User`, `Address`, `ProductOffer`, `Pool`, `PoolParticipant`, `Payment`, `Delivery`, `Complaint`, `SupplierPayout`, `SupplierRequest`, `SupplierRemoveRequest`, `Notification`, `Auth`, `Email`), each with a `couldBeUpdated` whitelist for patchable fields. There is no separate `Product` model — `ProductOffer` is self-contained. `Shipment`/`DistributionBatch` were removed from the MVP — `Delivery` relates directly to `Pool` via a unique `pool_ref`. See `docs/project-scope.md` for full entity shapes.
- Every service wired end-to-end (routes -> controller -> model) and mounted under `/api/v1/*` in `src/routes/api/v1/index.ts`. Most controllers now go well beyond generic CRUD with dedicated business-logic methods (state transitions, role-scoped visibility, cross-document orchestration) — see `docs/unimplemented-features.md` for which.
- **Authentication & role-based authorization**: JWT payload carries `{ _id, roles }`; `tokenMiddleware` attaches `{ userId, roles }` to `req.meta.user`; `requireRole(...roles)` (403 on no overlap, 401 on no user) is applied across essentially every route module, layered with controller-level ownership checks where access depends on whose document it is. `POST /auth/logout` and `DELETE /auth/remove` (retailer: immediate delete; supplier: opens a `SupplierRemoveRequest` for admin review) are implemented. `scripts/seed-admins.ts` (`npm run seed:admins`) seeds admin accounts. See `docs/unimplemented-features.md` §1/§1a for the full, verified breakdown.
- **Validation**: `validate()` + Zod is wired up for essentially every service (`auth`, `users`, `addresses`, `product.offers`, `pools`, `pool.participants`, `complaints`, `deliveries`, `notifications`, `supplier.payouts`, `supplier.requests`, `supplier.remove.requests`). `payments` has none by design (no client-supplied-body route exists), and the Thawani webhook accepts Thawani's own payload shape.
- **Core pool lifecycle**: joining a pool (`PoolParticipantController.create`) atomically reserves quantity against `Pool.currentQuantity` with a bound check (can't go below `minimumContribution` or leave a smaller-than-minimum remainder), flips `Pool.status` to `TARGET_REACHED` the instant it hits exactly 0, and creates a `Payment` + Thawani checkout session for the retailer's contribution. `Pool.status` then advances automatically through the rest of its lifecycle (`TARGET_REACHED -> DISTRIBUTING` on delivery assignment, `DISTRIBUTING -> COMPLETED` on delivery completion, `OPEN -> CANCELLED` via `PoolController.expirePool()`), and `Pool.supplierPaymentStatus` syncs to `PAID` when its `SupplierPayout` completes.
- **Payments (Thawani)**: full checkout-session integration (`src/services/thawani/thawani.gateway.ts`), dedicated `PaymentController` actions (`confirm`/`cancel`/`retry-refund`/`confirm-refund`, no generic `POST`/`PATCH`), and an intentionally unauthenticated webhook (`POST /webhooks/thawani`) that never trusts its payload directly — see `docs/unimplemented-features.md` §1b.
- **Supplier payouts**: auto-created off `DELIVERY_COMPLETED`, admin records the actual (manual, off-Thawani) transfer.
- **Transactions**: real Mongoose sessions/transactions in `PoolController.expirePool()` and `PaymentController.confirmPaymentById()`/`confirmRefund()`, backed by local Mongo running as a single-node replica set (`docker-compose.yml`) specifically so this works. The pool-join guard is deliberately a single-document atomic update instead (an external Thawani call sits in the middle of that flow).
- **Email-on-registration flow**: `auth` emits `user:registered` on `AppBroker` -> `emails` listener -> nodemailer send + `Email` log.
- **Notifications**: `DELIVERY_ASSIGNED` and the three `PAYMENT_*` events are wired to real notifications with per-recipient read state; other events raised on `AppBroker` (offer/supplier-request/complaint/payout) are not yet (see `docs/unimplemented-features.md` §9).
- **Test suite**: Jest is fully configured (`npm test`, `tests/`, mirroring `src/services/*`) — 35 suites / 507 tests, all currently passing. No `supertest`/`mongodb-memory-server`; controller tests mock Mongoose models directly, route tests introspect the real Express router stack.
- Containerized: multi-stage `Dockerfile`, `docker-compose.yml` (Mongo replica set + `mongo-express` + this backend + an `nginx` TLS reverse proxy fronting a sibling frontend repo).
- `meetings` service was scaffolded and then deliberately removed — confirmed not part of current scope.

## Partially Implemented — Needs Review Before Extending

- **Email verification** (`AuthController.verify`): decodes the token and responds with a plain string, but never sets `User.isVerified = true` or persists anything. The verification link is generated by signing an *access* token containing only `{ email }` (no `_id`), not a dedicated verification token — worth confirming intended design before building on it.
- **Offer approval workflow**: approving a `ProductOffer` (`PATCH status: 'APPROVED'`) and creating the matching `Pool` are still two separate, uncoordinated calls an admin must remember to make in order — nothing links them or validates the pool's params against the offer at creation time. See `docs/unimplemented-features.md` §2 for what a dedicated approve/negotiate/reject action set would need to cover.

## Not Yet Implemented

See `docs/unimplemented-features.md` for the full, current, per-section breakdown (recommended over this list — it's re-verified against the code more frequently). At a glance, the largest remaining gaps as of this writing:

- No atomic "approve offer -> create pool" workflow, and no dedicated request-negotiation/reject actions with required reasons + supplier notifications (§2).
- No `SUPPLIER`-visible "participants of my own pool" listing (§3), and no arbitrary client-side `list()` filters beyond role-based scoping (§11).
- `Notification.type` coverage stops at `DELIVERY_ASSIGNED` + the three `PAYMENT_*` events — offer/supplier-request/removal-request/complaint/payout events raised on `AppBroker` don't yet drive a notification (§9).
- No complaint conversation/message thread or fault classification (§5).
- No referential-integrity check before approving a `SupplierRemoveRequest` (open pools/payouts of that supplier aren't checked first) (§12).
- No Thawani webhook signature verification (an accepted, documented gap — re-confirm against Thawani's current docs before real money moves through it) (§1b).
- No access-token blacklist/revocation — logout only clears the persisted refresh token (§1a).

## Suggested Order of Next Steps (non-prescriptive)

1. Add dedicated `POST /offers/:id/approve|negotiate|reject` actions, with the approve action creating the `Pool` atomically (or at least validating its params against the offer) rather than leaving that to two manual calls.
2. Extend `Notification.type` and wire a listener per already-existing `AppBroker` event that doesn't yet drive one (supplier-request decided, removal-request decided, offer rejected/negotiation-requested, complaint filed/resolved, payout completed) — the mechanism (`AppBroker` -> `listeners()` -> `notify()`) is already proven out twice.
3. Add a `SUPPLIER`-scoped "participants of my own pool" listing.
4. Decide and implement a referential-integrity check before approving a `SupplierRemoveRequest`.

This list reflects gaps observed in the code, not commitments — confirm priorities with the project owner before acting on it.
