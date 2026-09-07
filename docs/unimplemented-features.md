# Unimplemented Features — Admin / Business Owner Workflow

> Gap analysis produced by inspecting `src/` directly on 2026-09-07 (previous snapshot: 2026-09-02, itself superseded mid-writing by the same day's later commits — see Methodology). This is a snapshot, not a commitment — re-verify against the code before treating a line here as still accurate, and before starting each item confirm nothing else touched it in the meantime.

## Overall status: core flows are implemented and passing — ready for end-to-end testing

Every route module is wired into `src/routes/api/v1/index.ts`, `npm run build` (`tsc`) compiles clean, `npx eslint .` reports 0 errors (12 pre-existing `no-console` warnings in scripts/bootstrap files only), and the full Jest suite is green: **35 suites / 507 tests passing**, 0 failing. The full retailer/supplier/admin lifecycle — register → file/approve a supplier request → create a product offer → admin creates a pool → retailer joins (Thawani checkout) → payment confirms (webhook or polling) → pool auto-advances `OPEN → TARGET_REACHED → DISTRIBUTING` → admin assigns/completes delivery → pool auto-advances to `COMPLETED` → supplier payout auto-creates → admin records the payout as paid — now runs start to finish without a manual `PATCH` gluing two calls together, backed by real Mongo transactions at every multi-document write. That makes the API substantially ready for QA/integration testing of the happy path and the auth/role matrix.

What's *not* done are specific, enumerated gaps (below) — mostly dedicated admin actions that today are still "just PATCH the status field yourself" (offer approve/negotiate/reject), a couple of missing visibility/filtering conveniences, and notification coverage for newer event types. None of these block exercising the core pool lifecycle end to end; they matter for polish, admin UX, and a few authorization/data-integrity edge cases called out explicitly below.

## Methodology

Every model in `src/services/*/*.model.ts` and its `couldBeUpdated` whitelist, every controller's custom (non-CRUD) logic, every `*.routes.ts` for which middleware is actually applied, `src/middlewares/*`, `src/constants/{REGISTRY,ERRORS,EVENTS}.ts`, `BaseController`, and the `tests/` directory were inspected directly for this pass — not assumed from the prior version of this doc or from `docs/project-scope.md`/`docs/tech-stack.md` (both are their own snapshots and can also have drifted). `npm run build`, `npx eslint .`, and the full `npx jest` run were all executed directly for this pass, not assumed.

**This pass corrects two internal inconsistencies left by the 2026-09-02 draft**, which was apparently written before that day's later commits (`f428e68` Thawani integration, `54455d4` pool/payout status automation, `c7753bf` list() refactor + tests, `69ff48f` transactions) and never fully reconciled against them:
- Old §1 still described `payments`/`supplier.payouts` as "zero auth, untouched generic CRUD" and listed authenticating them as the top "still needed" item, while old §11 already said the opposite ("auth coverage is effectively universal... re-verified directly against payments.routes.ts/supplier.payouts.routes.ts"). Re-verified again this pass: **§11 was right, §1 was stale.** Both routes files require `tokenMiddleware` + `requireRole` on every route, and neither controller is generic CRUD any more — see the new §1a below.
- Old §3/§4 still listed "nothing computes/enforces `TARGET_REACHED → DISTRIBUTING → COMPLETED`" and "no Pool.status update on delivery status change" as missing, while the old Summary's "Resolved since the above was written" list already said this was done. Re-verified: it **is** done (`DeliveryController.create()`/`.update()`, see §4).

**Since the 2026-09-02 snapshot, the following also shipped** (per `git log`, commits `f428e68`, `54455d4`, `c7753bf`, `69ff48f`) and is new to this document:
- A full `Payment`/Thawani checkout integration: `src/services/thawani/thawani.gateway.ts` (session creation, status lookup, refund request against Thawani's API), `src/services/payments/` restructured from generic CRUD into dedicated action endpoints (`confirm`/`cancel`/`retry-refund`/`confirm-refund`, no generic `POST`/`PATCH`), and `src/services/webhooks/thawani.webhook.controller.ts` (an intentionally unauthenticated callback endpoint that only ever triggers a re-verification against Thawani itself, never trusts the payload — see §1a).
- `SupplierPayout` auto-creation off a `DELIVERY_COMPLETED` event, plus a `Pool.supplierPaymentStatus` sync when a payout is marked `COMPLETED` (§6a).
- `Pool.status` now advances automatically past `TARGET_REACHED`: assigning a delivery flips it to `DISTRIBUTING`, and the delivery reaching `DELIVERED` flips it to `COMPLETED` and every still-`WAITING` `PoolParticipant` to `DELIVERED` (§3/§4).
- `PoolController.expirePool()` and `PaymentController.confirmPaymentById()`/`confirmRefund()` now wrap their multi-document writes in real Mongoose transactions, backed by Mongo now running as a single-node replica set in `docker-compose.yml` (§11).
- `BaseController.list()` was refactored into the single generic implementation described in §11 (this was previously listed as a "resolved" item already, now re-verified against the actual current code, including its interaction with the new `payments`/`supplier.payouts` controllers).
- Test suite grew from 23 suites / 335+ tests to **35 suites / 507 tests**, all passing, covering the new payments/webhook/payout code paths (`payments.controller.test.ts`, `payments.routes.test.ts`, `thawani.gateway.test.ts`, `thawani.webhook.controller.test.ts`, `supplier.payouts.controller.test.ts`, `supplier.payouts.routes.test.ts`, plus `pool.model.test.ts` and `delivery-notification.integration.test.ts`).

---

## 1. Admin Account / Authorization

**Closed.** JWT carries `{ _id, roles }` (`src/services/auth/auth.controller.ts`, `jwt.util.ts`). `tokenMiddleware` attaches `{ userId, roles }` to `req.meta.user`. `requireRole(...roles)` matches on *any* overlap with the caller's roles (401 no user, 403 no overlap). `scripts/seed-admins.ts` (`npm run seed:admins`) is unchanged.

Every route module applies `tokenMiddleware` (+ `requireRole` and/or controller-level ownership checks), **with one deliberate exception**: the Thawani webhook (`POST /webhooks/thawani`) is intentionally unauthenticated — it's called by Thawani, not a logged-in user, and never trusted directly (see §1a). Everything else, including `payments` and `supplier.payouts` (previously the two most exposed modules — this is what the old §1 still flagged as "still needed"), is fully authenticated and role-scoped. Re-verified directly against every `*.routes.ts` file this pass: auth coverage is complete except for that one deliberate webhook exception.

`pools` `GET`/`GET :id` and `addresses` `POST` intentionally allow anonymous/optional auth (public pool browsing; pre-registration address creation) — a deliberate design choice, not a gap. `complaints` `GET`/`GET :id`/`PATCH :id` apply `tokenMiddleware` but no `requireRole` — access is narrowed inside the controller (owner-or-ADMIN), consistent with the pattern used elsewhere (e.g. `addresses`).

**Nothing outstanding here.**

---

## 1a. Auth Session Management

- Done: `POST /auth/logout` (any authenticated role) clears the caller's persisted `Auth.refreshToken`, and `POST /auth/refresh` checks the presented refresh token against that persisted value. The caller's current *access* token still works until its own expiry (`JWT_TOKEN_TTL`, default `1h`) — there is no access-token revocation/blacklist.
- Done: `DELETE /auth/remove` (any authenticated role, body `{ reason }`) — a caller without `SUPPLIER` is deleted immediately (`User` + `Auth` records); a caller with `SUPPLIER` (with or without `RETAILER`) instead opens a `SupplierRemoveRequest` for admin review (see §12) rather than self-deleting outright.
- Missing: no equivalent flow exists for a RETAILER-only self-deletion to check for *their own* loose ends (e.g. an open `PoolParticipant`/pending payment) before hard-deleting — it just deletes. Whether that matters depends on a product decision about what should happen to a pool's `currentQuantity`/`PoolParticipant` rows when a participant's account vanishes; nothing today reconciles that (no cascading update, no orphan check).
- Missing: no access-token blacklist/short-TTL-and-rotate scheme, so "log out everywhere immediately" is only partially true (see above).

---

## 1b. Payments & Thawani Integration (new section — undocumented until this pass)

- `src/services/thawani/thawani.gateway.ts` wraps Thawani's checkout-session and refund APIs. A `Payment` (`user_ref`, `pool_ref`, `poolParticipant_ref`, `thawaniSessionId`, `thawaniPaymentId`, `thawaniRefundId`, `status: PENDING|COMPLETED|FAILED|REFUND_PENDING|REFUNDED|REFUND_FAILED`, `amount`) is created only as a side effect of `PoolParticipantController.create()` (joining a pool) — there is no generic `POST /payments` and `couldBeUpdated` is empty (no generic `PATCH` either); every state transition goes through one of the dedicated actions below.
- `POST /payments/:id/confirm` (owner or ADMIN) — re-verifies the session against Thawani directly (never trusts a redirect) and, on a real `PENDING → COMPLETED` transition, atomically flips the linked `PoolParticipant` to `WAITING` inside a Mongo transaction. Idempotent — safe under a race with the webhook.
- `POST /payments/:id/cancel` (owner or ADMIN) — only valid from `PENDING`, flips to `FAILED`, flips the participant to `PAYMENT_FAILED`, and releases the pool's reserved quantity back (only if the pool is still `OPEN`).
- `POST /payments/:id/retry-refund` and `POST /payments/:id/confirm-refund` (ADMIN only) — re-request a failed refund against Thawani, and manually confirm a refund completed (deliberately manual: Thawani's refund-status response schema isn't confirmed from documentation, so an admin checks the merchant dashboard rather than the code guessing at an unconfirmed status string). `confirm-refund` flips both `Payment` and `PoolParticipant` to `REFUNDED` inside a transaction.
- `POST /webhooks/thawani` — unauthenticated by design (see §1). The payload is never trusted for anything beyond extracting a `client_reference_id` to know *which* payment to re-check; the actual state change always comes from a fresh authenticated call back to Thawani via `confirmPaymentById()`. A forged webhook call can at most trigger a redundant, harmless status check.
- **Missing:** no webhook signature verification scheme is implemented (the code comments note Thawani doesn't document one to verify against) — this is a known, accepted gap rather than an oversight, but worth re-confirming against Thawani's current docs before going live with real money.
- **Missing:** no automated retry/sweep for a `Payment` stuck `PENDING` indefinitely (e.g. retailer abandons checkout without hitting `cancel_url`) beyond whatever `PoolController.expirePool()` sweeps when a *pool* expires — there's no payment-level timeout independent of pool expiry.

---

## 2. Supplier Product Offers

**The `Product`/`ProductOffer` split from the old spec no longer exists — `ProductOffer` is now the single, self-contained entity.**

- Already implemented: `ProductOffer` directly carries `name/description/brand/unit/images/wholeQuantity/price/status(PENDING|NEGOTIATION|APPROVED|REJECTED)/adminComment/rejectedAt`. No separate `Product` model or `product_ref`.
- `status` is in `couldBeUpdated`, and `ProductOfferController.update()` (not `BaseController.update`) enforces who may touch what: the owning `SUPPLIER` may edit product/commercial fields, `ADMIN` may only touch `status`/`adminComment`, on any offer. A rejected offer's `rejectedAt` is kept in sync (set on `REJECTED`, cleared otherwise) and drives a 7-day TTL auto-delete index.
- **Still missing:** there is still no *dedicated* approve/negotiate/reject action — an admin just `PATCH`es `status` directly via the generic split-permission `update()`. Specifically:
  - No atomic "approve creates the Pool" workflow — approving an offer (`status: 'APPROVED'`) is just a field write; creating the matching `Pool` is still a fully separate, uncoordinated `POST /pools` call an admin must remember to make. Nothing links them, nothing validates the Pool's params against the offer's `wholeQuantity`/`price` at creation time.
  - No dedicated "request negotiation" action with a required message, or automatic `Notification` to the supplier when that happens (`Notification.type` doesn't even have a value for it — see §9).
  - No dedicated "reject" action requiring a reason (an admin can set `status: 'REJECTED'` without `adminComment`) or automatic supplier notification.
- Missing: filtering `GET /offers` by `status` — cross-cutting `list()` gap (§11), still applies here (though `list()` filters by caller role — ADMIN sees all, SUPPLIER sees only their own).

---

## 3. Pool Management

- Already implemented: `status: OPEN|TARGET_REACHED|DISTRIBUTING|COMPLETED|CANCELLED`, `couldBeUpdated` includes `status`, `startDate` is a real schema field.
- `OPEN → TARGET_REACHED`: `PoolParticipantController.create()` atomically decrements `Pool.currentQuantity` on join and flips `status` to `TARGET_REACHED` the instant it hits exactly 0, using a single-document MongoDB update pipeline (no multi-document transaction needed) so concurrent joins can't race past the bound. An admin manually patching `currentQuantity` down to 0 via `PATCH /pools/:id` does **not** auto-flip status (`PoolController` has no generic `update()` override for that field), so this specific trigger is join-triggered only.
- **`TARGET_REACHED → DISTRIBUTING → COMPLETED` is now automatic**, closing the gap the 2026-09-02 draft still listed as missing in this section (its own Summary already said otherwise — see Methodology). `DeliveryController.create()` flips the pool to `DISTRIBUTING` the moment a delivery is assigned to a `TARGET_REACHED` pool; `DeliveryController.update()` flips it to `COMPLETED` (and every still-`WAITING` `PoolParticipant` to `DELIVERED`) the moment that delivery's own status transitions into `DELIVERED`. Both syncs are best-effort/logged-on-failure by design (see §11) rather than transactional, since they're secondary bookkeeping alongside the delivery write that must not be blocked by it.
- Vocabulary note (unchanged): the enum still has no distinct "successfully wrapped up" terminal state distinct from `CANCELLED` — `COMPLETED` is the closest fit and is now actually reached automatically (see above).
- Missing (partially resolved): viewing a pool's participants. `GET /participants?pool_ref=...` works for `ADMIN` (sees everyone) and for `RETAILER` (sees only their own participation) — but there is still no way for the pool's owning `SUPPLIER` to list *all* participants of their own pool. Re-verified this pass: `PoolParticipantController`'s filter logic still has no `SUPPLIER` branch at all.
- Missing: filtering `GET /pools` by status beyond the built-in role-based visibility rule — there's no way for an ADMIN to ask for just `TARGET_REACHED` pools, for instance. Cross-cutting `list()` gap, §11.

---

## 4. Delivery Assignment

- `Delivery.pool_ref` (unique). `DeliveryController.create()` enforces pool exists (404), `Pool.status` not `OPEN`/`CANCELLED` (409), at most one delivery per pool (409) — then flips the pool to `DISTRIBUTING` and raises `EVENTS.DELIVERY_ASSIGNED`, which `NotificationController.listeners()` turns into two notifications: one to the offer's supplier, one to every `PoolParticipant` of that pool.
- `DeliveryController.update()` now has real side effects on the `PENDING → DELIVERING → DELIVERED` transition (closing the gap the 2026-09-02 draft still listed as "no notification, no Pool.status update on delivery status change"): the moment `deliveryStatus` transitions into `DELIVERED`, it flips `Pool.status` to `COMPLETED`, flips every still-`WAITING` `PoolParticipant` to `DELIVERED`, and raises `EVENTS.DELIVERY_COMPLETED`, which `SupplierPayoutController.listeners()` turns into an auto-created `SupplierPayout` (§6a).
- `POST/PATCH/DELETE /deliveries` require `tokenMiddleware` + `requireRole('ADMIN')`. `GET`/`GET :id` require `tokenMiddleware` and are role-scoped: ADMIN sees all; RETAILER sees deliveries for pools they've joined; SUPPLIER sees deliveries for pools built from their own offers (union of both when a caller holds both roles).
- **Still missing:** no notification specifically for the delivery status *change itself* (`PENDING → DELIVERING`, and `→ DELIVERED` beyond the payout side effect) — a participant finds out delivery was assigned, but not that it's now en route, short of polling.

---

## 5. Complaints

- Unchanged model shape: `pool_ref`/`creator_ref`/`title`/`description`/`priority(LOW|MEDIUM|HIGH)`/`status(OPEN|'UNDER REVIEW'|RESOLVED)`/`resolution`.
- `status` is in `couldBeUpdated`, and `ComplaintController.update()` (not generic `BaseController.update`) enforces the split: the filer may only edit `title`/`description`/`priority`; `ADMIN` may edit anything, including `status`/`resolution`, on any complaint.
- `GET`/`GET :id`/`PATCH :id` require `tokenMiddleware` (role-scoped inside the controller: ADMIN sees/edits all, everyone else only what they filed); `POST` additionally requires `requireRole('RETAILER', 'SUPPLIER')`; `DELETE` requires `requireRole('ADMIN')`.
- **Still missing, unchanged:** no conversation/message thread entity (`resolution` is still one free-text field, not a thread — re-verified, no complaint-related message model exists). No fault-classification field (supplier vs. OrderPool-operations root cause). No automatic `Notification` on complaint state changes — `Notification.type` still has no complaint-related value (§9).

---

## 6. Supplier Management

- Unchanged: suppliers are `User` documents holding `SUPPLIER` in `roles[]` — no separate collection, `GET /users/:id` populates `addresses`.
- Missing, unchanged: no `?role=SUPPLIER` filtering on `GET /users` (cross-cutting `list()` gap, §11) — `UsersController.list()` still does a bare `this.model.find().select('-password')`, ignoring `req.query` entirely (re-verified, no `req.query` reference in `users.controller.ts`).
- Missing, unchanged: no aggregated "supplier profile" view.
- A `SUPPLIER` can no longer just delete their own account outright — see §12.

---

## 6a. Supplier Payouts (new section — undocumented until this pass)

- `SupplierPayout` (`pool_ref`, `amount`, `status: PENDING|COMPLETED|...`, `transactionReference`, `paidAt`) records what a supplier is owed for a completed pool — `amount` is fixed at creation to the offer's agreed `price` (the platform's margin is baked into `Pool.pricePerUnit` set at pool creation, not computed here).
- **Auto-created**, not something an admin has to remember: `SupplierPayoutController.listeners()` reacts to `EVENTS.DELIVERY_COMPLETED` (raised by `DeliveryController.update()`, see §4) and creates a `PENDING` payout for the pool if one doesn't already exist. `POST /payouts` still exists as an ADMIN-only manual fallback (e.g. if the auto-create path failed because the pool or offer couldn't be found at that moment) — it enforces the delivery is actually `DELIVERED` first (409 otherwise) and that a payout doesn't already exist for the pool (409).
- `GET`/`GET :id` are role-scoped: ADMIN sees all, SUPPLIER sees only payouts for pools built from their own offers. `PATCH /payouts/:id` (ADMIN only) lets an admin record the actual transfer (`status`/`transactionReference`/`paidAt` — `paidAt` auto-stamped on a transition into `COMPLETED` unless explicitly supplied); on that transition it best-effort syncs `Pool.supplierPaymentStatus` to `PAID` (logged, not blocking, if it fails).
- **Missing:** Thawani has no vendor/marketplace payout API (verified against its documented surface in `thawani.gateway.ts`'s own comments) — actually moving money to the supplier is a manual transfer outside this codebase; the API only tracks that it happened.
- **Missing:** no notification to the supplier when a payout is recorded as paid.

---

## 7. Supplier Requests — fully implemented

**Closed.**

- `src/services/supplier.requests/` exists end to end: `supplier.request.model.ts` (`user_ref`, `description`, `status: PENDING|APPROVED|REJECTED`, `adminComment`), controller, Zod schemas, routes.
- A request is filed by an already-registered, authenticated `RETAILER` who isn't already a `SUPPLIER`, always under their own `user_ref`. `POST` creates (blocks a second `PENDING` request per user, 409). `GET`/`GET :id` are role-scoped (ADMIN sees all, RETAILER sees only their own). `PATCH :id` splits permissions: the owning RETAILER may only edit `description`, and only while still `PENDING`; ADMIN may only set `status`/`adminComment`, and only on a still-`PENDING` request. Approving does `$addToSet: { roles: 'SUPPLIER' }` on the underlying `User` — additive, never replacing `RETAILER`. `DELETE :id` lets the owner withdraw their own request or ADMIN delete any.
- Missing, unchanged: no automatic `Notification`/email when a request is approved/rejected — `Notification.type` has no value for it (§9).

---

## 8. (folded into §7 above — see note there)

The old doc's §7 and §8 were two views of the same gap (no `SupplierRequest` entity). Now that it exists, splitting them no longer makes sense; kept as a stub heading only so section numbers below stay stable relative to the prior version of this document.

---

## 9. Notifications

- `recipients: [{ user_ref, isRead, readAt }]` gives genuine per-recipient read state. `NotificationController` has a private `notify()` helper used both by the admin-facing `POST` and by every business-event listener, plus a `scopeToRecipient()` helper that strips every recipient entry except the caller's own before a non-admin ever sees a notification document.
- `type` enum is still just `'DELIVERY_ASSIGNED'` — there is no offer-rejected/negotiation-requested/supplier-request-decided/removal-request-decided/complaint-related/payment-related/payout-related value yet, despite all of those now being real events raised on `AppBroker` (`EVENTS.ts` now also has `DELIVERY_COMPLETED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED` — none of them currently drive a `Notification`, only `SupplierPayoutController`'s auto-create listens to `DELIVERY_COMPLETED`). Extending this remains a small, additive change (`notification.model.ts`'s `NotificationType` union + schema enum) — the mechanism is proven out by two triggers now (`DELIVERY_ASSIGNED`, and indirectly the payout auto-create), not just one.
- `couldBeUpdated` covers ADMIN content edits (`title`/`message`/`actionUrl`/`priority`); a recipient may additionally patch only their own `recipients[].isRead` (`readAt` derived server-side).
- **Still the single wired-to-notifications trigger:** `EVENTS.DELIVERY_ASSIGNED`. Every payment/payout/offer/supplier-request/complaint event that now exists on `AppBroker` still creates zero notifications — this is a direct, mechanical gap (add a listener + a `NotificationType` value per event), not a design problem, since the plumbing itself (`AppBroker` → `listeners()` → `notify()`) is proven and reused already.

---

## 10. Historical Data

- The status-based soft-close pattern (`ProductOffer.status`, `Pool.status`, `Complaint.status`, `SupplierRequest.status`, `SupplierRemoveRequest.status`, `Payment.status`, `SupplierPayout.status`) is well-established across seven entities now.
- `DELETE` is behind `tokenMiddleware` + either `requireRole('ADMIN')` or an owner-or-ADMIN controller check on every entity that exposes it. `payments` and `supplier.payouts` never had a `DELETE` route at all (financial records, deliberately never hard-deletable via the API) and both have full `requireRole` coverage on every route they do expose.

---

## 11. Cross-Cutting Gaps

- **Closed.** `BaseController.list()` is the single place `list()` lives — every subclass overrides `buildListFilter(req, res)` (role-scoped filter, or `null` after sending its own response) and optionally `listSelect()`/`transformListDoc()`. Pagination is opt-in via `?page`/`?limit` (both required, positive integers, `limit` capped at 100). There is still no arbitrary client-side field filter (e.g. `GET /offers?status=PENDING` beyond role scoping) — that would need each `buildListFilter()` to merge in caller-supplied query params, which none do yet (re-verified: no controller reads `req.query` for this purpose).
- **Closed.** `tokenMiddleware`/`requireRole` cover every route module including `payments` and `supplier.payouts`, with the one deliberate exception of the Thawani webhook (§1/§1b). Auth coverage is complete.
- **Resolved, for specific flows.** `docker-compose.yml`'s `mongo` service runs as a single-node replica set (`--replSet rs0`), specifically so Mongoose sessions/transactions work. `PoolController.expirePool()` (cancel + Payment/PoolParticipant sweep) and `PaymentController.confirmPaymentById()`/`confirmRefund()` (Payment status flip + its PoolParticipant status flip) use real multi-document transactions. **Still not transactional, deliberately:** the pool-join guard (an external Thawani call sits in the middle of that flow — a DB transaction must never stay open across an external HTTP round trip) and the Pool/PoolParticipant/SupplierPayout lifecycle-status syncs (delivery→pool/participant status in §3/§4, payout→pool payment status in §6a — all logged-best-effort by design). Multi-document admin actions this spec still calls for (approve offer → create Pool, §2) still have no transaction wrapping them, because that workflow doesn't exist yet at all.

---

## 12. Account Removal Workflow (not in the original spec)

- `src/services/supplier.remove.requests/` — model (`user_ref`, `reason`, `status: PENDING|APPROVED|REJECTED`, `adminComment`), controller, Zod update schema, routes. **No `POST` route** — a request is only ever created as a side effect of `AuthController.remove()` (see §1a), never posted directly by a client.
- `GET`/`GET :id` are role-scoped (ADMIN sees all, everyone else only their own). `PATCH :id` is ADMIN-only; approving deletes the requester's `User` and `Auth` records outright. `DELETE :id` lets the owner withdraw their own still-`PENDING` request, or ADMIN delete any regardless of status.
- Missing (matches a note already in §7 for the mirror-image role-grant flow): no automatic `Notification`/email when a removal request is approved/rejected.
- **Explicitly out of scope so far, worth a product decision:** approving a removal request just deletes the `User` — it does not check for open pools, pending payouts, or in-flight `PoolParticipant` rows tied to that supplier first. No referential-integrity check exists anywhere else in the codebase either, so this wasn't treated as a special case, but it means an admin can currently approve a removal out from under a supplier with an active pool.

---

## Summary

```text
Verified this pass (build/lint/tests actually run, not assumed):
- npm run build (tsc) — clean, 0 errors
- npx eslint . — 0 errors, 12 pre-existing no-console warnings (scripts/bootstrap only)
- npx jest — 35 suites / 507 tests, all passing

Already implemented and end-to-end wired (the full pool lifecycle runs without manual gluing):
- Multi-role User.roles[] (additive role grants, requireRole matches any overlap)
- SupplierRequest / SupplierRemoveRequest: full model/controller/routes/schema, role-scoped, split PATCH permissions
- ProductOffer: self-contained entity; status patchable with owner/admin field-split enforcement; rejectedAt TTL auto-delete
- Complaint: status/resolution patchable with owner/admin field-split enforcement
- Pool: OPEN -> TARGET_REACHED -> DISTRIBUTING -> COMPLETED now all auto-triggered (join, delivery-assigned, delivery-delivered respectively)
- Pool join guard: minimumContribution <= quantity <= currentQuantity, race-safe without transactions
- Payment/Thawani: checkout session creation, confirm/cancel/retry-refund/confirm-refund dedicated actions, unauthenticated-by-design webhook that only ever re-verifies against Thawani directly
- SupplierPayout: auto-created off DELIVERY_COMPLETED, amount fixed at creation, admin records the actual (manual, off-platform) transfer
- Delivery -> Notification: DELIVERY_ASSIGNED event wired end to end (supplier + every participant notified)
- Notification: per-recipient read state
- Auth: /auth/logout, /auth/remove (retailer: immediate delete; supplier: SupplierRemoveRequest for admin review)
- Auth coverage is complete across the API except the one deliberate Thawani webhook exception
- Real Mongo transactions (single-node replica set) for expirePool(), payment confirm/refund, keeping Payment+PoolParticipant writes atomic
- BaseController.list() generic filtering/pagination
- Jest suite: 35 suites / 507 tests, all green

Still missing (confirmed still true, re-verified against current code this pass):
- Approve-offer workflow that atomically creates the Pool (still two uncoordinated calls)
- Request-negotiation / reject-offer dedicated actions + supplier notifications
- Arbitrary client-side list() filters (e.g. `?status=`) beyond role scoping
- SUPPLIER-visible "participants of my own pool" listing (admin-only and self-only today)
- Notification.type coverage for offer-rejected/negotiation-requested/supplier-request-decided/removal-request-decided/complaint/payment/payout events (only DELIVERY_ASSIGNED is wired to a notification today, despite 5 business events now existing on AppBroker)
- Notification specifically for a delivery's own status change (PENDING -> DELIVERING), separate from the DELIVERED side effects
- Complaint conversation/message thread; supplier-vs-OrderPool fault classification
- Supplier-by-role filtering (?role=SUPPLIER) / supplier profile aggregation
- Referential-integrity check before approving a SupplierRemoveRequest (open pools/payouts not checked)
- RETAILER self-deletion doesn't check for open PoolParticipant/pending payment rows before hard-deleting
- No access-token blacklist/revocation (logout only clears the refresh token)
- No Thawani webhook signature verification (accepted gap, re-confirm against current Thawani docs before real money moves through it)
- No payment-level timeout independent of pool expiry (a PENDING payment only gets swept up if/when its pool expires)

Needs model:
- ComplaintMessage / complaint conversation entity (still not started)

Needs controller/service:
- ProductOffer: approve / requestNegotiation / reject actions (atomic with Pool creation where relevant)
- Pool: participants-by-pool listing for the owning SUPPLIER
- Complaint: add message; classify fault

Needs route:
- POST /offers/:id/approve, /offers/:id/negotiate, /offers/:id/reject
- GET /pools/:id/participants (or equivalent SUPPLIER-scoped filter on the existing endpoint)
- POST /complaints/:id/messages, PATCH .../classify

Needs validation:
- Zod schemas for every new route above

Needs notification:
- Notification.type enum extended for: offer negotiation requested, offer rejected, supplier request approved/rejected, removal request approved/rejected, delivery status changed, complaint filed/resolved, payment completed/failed/refunded, payout completed
- Trigger points (listeners) wired into each new/existing controller action above, following the DELIVERY_ASSIGNED / DELIVERY_COMPLETED pattern already proven out twice
```
