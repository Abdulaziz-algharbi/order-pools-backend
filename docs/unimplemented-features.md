# Unimplemented Features — Admin / Business Owner Workflow

> Gap analysis produced by inspecting `src/` directly on 2026-09-02 (previous snapshot: 2026-08-28 — a great deal has shipped since, see Methodology). This is a snapshot, not a commitment — re-verify against the code before treating a line here as still accurate, and before starting each item confirm nothing else touched it in the meantime.

## Methodology

Every model in `src/services/*/*.model.ts` and its `couldBeUpdated` whitelist, every controller's custom (non-CRUD) logic, every `*.routes.ts` for which middleware is actually applied, `src/middlewares/*`, `src/constants/{REGISTRY,ERRORS,EVENTS}.ts`, `BaseController`, and the `tests/` directory were inspected directly for this pass — not assumed from the prior version of this doc or from `docs/project-scope.md`/`docs/tech-stack.md` (both are their own snapshots and can also have drifted).

**Since the 2026-08-28 snapshot, the following shipped** (per `git log`) and invalidate large parts of the old version of this document:
- `User.role: UserRole` → `User.roles: UserRole[]` — a user can now hold more than one role at once (e.g. an approved supplier request adds `SUPPLIER` onto an existing `RETAILER` rather than replacing it). `requireRole(...roles)` now matches if *any* of the caller's roles is in the allowed set.
- Role-scoped access control (auth + ownership/ADMIN-or-owner filtering) added to `pools`, `pool.participants`, `product.offers`, `addresses`, `complaints` (partially), `deliveries`, `notifications`, `supplier.requests`.
- A real `SupplierRequest` model/controller/routes now exists end to end (§7 below is fully rewritten — the old "no such entity" gap is closed).
- The separate `Product` entity was dropped; `ProductOffer` now directly carries `name/description/brand/unit/images/wholeQuantity/price` itself (no `product_ref`).
- `Notification` was restructured: `recipient_ref: ObjectId[]` + top-level `isRead`/`readAt` → `recipients: [{ user_ref, isRead, readAt }]` (per-recipient read state). `type` enum was also narrowed to just `'DELIVERY_ASSIGNED'` (the old `PRODUCT_APPROVED`/`NEW OFFER`/`NEW COMPLAINT` values are gone, not extended).
- A `DELIVERY_ASSIGNED` business event now exists (`src/constants/EVENTS.ts`, an `AppBroker` pub/sub pattern) and actually notifies both the supplier and every participating retailer when an admin assigns a delivery.
- `Pool.startDate` — previously declared in the TS interface/`couldBeUpdated` but missing from the actual Mongoose schema (a dead field) — is now a real schema field.
- `Pool.currentQuantity` now means *quantity still available to be claimed* (counts down from an initial value toward 0), not a running total collected. Joining a pool (`POST /participants`) atomically decrements it and enforces `minimumContribution <= quantity <= currentQuantity`, forbidding a join that would leave a nonzero remainder below `minimumContribution`. Hitting exactly 0 auto-flips `Pool.status` to `TARGET_REACHED` in the same atomic operation — the `OPEN → TARGET_REACHED` transition described as entirely missing in the old snapshot is now handled, at least for this one trigger.
- `POST /auth/logout` and `DELETE /auth/remove` now exist, plus a new `supplier.remove.requests` service (see new §1a/§12 below).
- A Jest test suite now exists and is wired up (`npm test`, `jest.config.js`) — 23 suites / 335+ tests as of this pass. The prior doc's implicit assumption of no test coverage is stale; `CLAUDE.md` itself still says "no test framework is currently wired up," which is now inaccurate too.

---

## 1. Admin Account / Authorization

**Substantially rolled out since the last pass — two fully unauthenticated modules remain.**

- Done: JWT carries `{ _id, roles }` (`src/services/auth/auth.controller.ts`, `jwt.util.ts`). `tokenMiddleware` attaches `{ userId, roles }` to `req.meta.user`. `requireRole(...roles)` matches on *any* overlap with the caller's roles (401 no user, 403 no overlap).
- Done: `scripts/seed-admins.ts` (`npm run seed:admins`) — unchanged from the last pass.
- Done: every route module below now applies `tokenMiddleware` (+ `requireRole` and/or controller-level ownership checks) **except two**:
  - **`payments`** (`src/services/payments/payments.routes.ts`) — every verb (`GET/POST/PATCH/DELETE`) has zero `tokenMiddleware`. `PaymentController` is untouched generic CRUD (no overrides at all). Anyone can list every payment, create a payment under an arbitrary `user_ref`, or delete any payment record.
  - **`supplier.payouts`** (`src/services/supplier.payouts/supplier.payouts.routes.ts`) — same: zero auth, generic CRUD, no overrides.
- All other modules (`addresses`, `auth`, `complaints`, `deliveries`, `notifications`, `pool.participants`, `pools`, `product.offers`, `supplier.remove.requests`, `supplier.requests`, `users`) require `tokenMiddleware` on every non-public route, and most also apply either `requireRole` or a controller-level ownership/role split (see each section). `pools` `GET`/`GET :id` and `addresses` `POST` intentionally allow anonymous/optional auth (public pool browsing; pre-registration address creation) — that's a deliberate design choice, not a gap.
- `complaints` `GET`/`GET :id`/`PATCH :id` apply `tokenMiddleware` but no `requireRole` — access is instead narrowed inside the controller (owner-or-ADMIN). This is consistent with the pattern used elsewhere (e.g. `addresses`) and not itself a gap.

**Still needed:** authenticate and authorize `payments` and `supplier.payouts` — currently the two most exposed modules in the API (financial records, no auth at all).

---

## 1a. Auth Session Management (new since last pass)

- Done: `POST /auth/logout` (any authenticated role) clears the caller's persisted `Auth.refreshToken`, and `POST /auth/refresh` now checks the presented refresh token against that persisted value (previously it only checked the JWT's own signature/expiry and never consulted the DB at all — a logged-out or rotated refresh token would silently have kept working). The caller's current *access* token still works until its own expiry (`JWT_TOKEN_TTL`, default `1h`) — there is no access-token revocation/blacklist.
- Done: `DELETE /auth/remove` (any authenticated role, body `{ reason }`) — a caller without `SUPPLIER` is deleted immediately (`User` + `Auth` records); a caller with `SUPPLIER` (with or without `RETAILER`) instead opens a `SupplierRemoveRequest` for admin review (see §12) rather than self-deleting outright.
- Missing: no equivalent flow exists for a RETAILER-only self-deletion to check for *their own* loose ends (e.g. an open `PoolParticipant`/pending payment) before hard-deleting — it just deletes. Whether that matters depends on a product decision about what should happen to a pool's `currentQuantity`/`PoolParticipant` rows when a participant's account vanishes; nothing today reconciles that (no cascading update, no orphan check).
- Missing: no access-token blacklist/short-TTL-and-rotate scheme, so "log out everywhere immediately" is only partially true (see above).

---

## 2. Supplier Product Offers

**The `Product`/`ProductOffer` split from the old spec no longer exists — `ProductOffer` is now the single, self-contained entity.**

- Already implemented: `ProductOffer` directly carries `name/description/brand/unit/images/wholeQuantity/price/status(PENDING|NEGOTIATION|APPROVED|REJECTED)/adminComment/rejectedAt`. No separate `Product` model or `product_ref` — that entity was dropped entirely (commit `87952ba`).
- **Resolved from the old snapshot:** `status` **is** now in `couldBeUpdated`, and `ProductOfferController.update()` (not `BaseController.update`) enforces who may touch what: the owning `SUPPLIER` may edit product/commercial fields, `ADMIN` may only touch `status`/`adminComment`, on any offer. A rejected offer's `rejectedAt` is kept in sync (set on `REJECTED`, cleared otherwise) and drives a 7-day TTL auto-delete index — a real, working piece of the "historical data" story for this entity.
- **Still missing:** there is still no *dedicated* approve/negotiate/reject action — an admin just `PATCH`es `status` directly via the generic split-permission `update()`. Specifically:
  - No atomic "approve creates the Pool" workflow — approving an offer (`status: 'APPROVED'`) is just a field write; creating the matching `Pool` is still a fully separate, uncoordinated `POST /pools` call an admin must remember to make. Nothing links them, nothing validates the Pool's params against the offer's `wholeQuantity`/`price` at creation time.
  - No dedicated "request negotiation" action with a required message, or automatic `Notification` to the supplier when that happens (`Notification.type` doesn't even have a value for it — see §9).
  - No dedicated "reject" action requiring a reason (an admin can set `status: 'REJECTED'` without `adminComment`, since neither is required together) or automatic supplier notification.
- Missing: filtering `GET /offers` by `status` — cross-cutting `list()` gap (§11), still applies here (though `list()` at least now filters by caller role — ADMIN sees all, SUPPLIER sees only their own).

---

## 3. Pool Management

- Already implemented: `status: OPEN|TARGET_REACHED|DISTRIBUTING|COMPLETED|CANCELLED`, `couldBeUpdated` includes `status`, `startDate` is now a real schema field (fixed).
- **Resolved from the old snapshot:** the `OPEN → TARGET_REACHED` transition is no longer entirely unenforced. `PoolParticipantController.create()` now atomically decrements `Pool.currentQuantity` on join and flips `status` to `TARGET_REACHED` the instant it hits exactly 0, using a single-document MongoDB update pipeline (no multi-document transaction — see §11) so concurrent joins can't race past the bound. This is the *only* trigger for that transition, though — an admin manually patching `currentQuantity` down to 0 via `PATCH /pools/:id` does **not** auto-flip status (`PoolController` has no `update()` override; it goes through generic `BaseController.update`), so the transition is join-triggered only, not quantity-triggered in general.
- Vocabulary note (unchanged from last pass): the enum still has no distinct "successfully wrapped up" terminal state distinct from `CANCELLED` — `COMPLETED` is the closest fit once a `Delivery` finishes, but nothing sets it automatically (see §4).
- Missing (partially resolved): viewing a pool's participants. `GET /participants?pool_ref=...` now exists and works for `ADMIN` (sees everyone) and is combinable with the caller's own scope for `RETAILER` (sees only their own participation within that pool) — but there is still no way for the pool's owning `SUPPLIER` to list *all* participants of their own pool. `PoolParticipantController.list()`'s filter is `{}` for ADMIN or `{ user_ref: caller }` for everyone else; it never checks "is this pool built from one of my offers."
- Missing: filtering `GET /pools` by status beyond the built-in role-based visibility rule (ADMIN sees all; RETAILER/anonymous see only `OPEN`; SUPPLIER additionally sees pools from their own offers regardless of status) — there's no way for an ADMIN to ask for just `TARGET_REACHED` pools, for instance. Cross-cutting `list()` gap, §11.
- Missing: nothing computes/enforces `TARGET_REACHED → DISTRIBUTING → COMPLETED`. `DeliveryController.create()` requires the pool be past `OPEN`/`CANCELLED` to attach a delivery, but creating a delivery doesn't itself move `Pool.status` to `DISTRIBUTING`, and nothing moves it to `COMPLETED` when `Delivery.deliveryStatus` reaches `DELIVERED`. These two are still fully manual `PATCH /pools/:id` calls an admin must remember to make, uncoordinated with the delivery's own state.

---

## 4. Delivery Assignment

- Unchanged structurally from the last pass, now with a working notification hook: `Delivery.pool_ref` (unique). `DeliveryController.create()` enforces pool exists (404), `Pool.status` not `OPEN`/`CANCELLED` (409), and at most one delivery per pool (409) — then raises `EVENTS.DELIVERY_ASSIGNED`, which `NotificationController.listeners()` turns into two notifications: one to the offer's supplier ("prepare the order"), one to every `PoolParticipant` of that pool ("your delivery is on its way"). This closes the "no notification triggered on delivery creation" gap from the last pass.
- `POST/PATCH/DELETE /deliveries` require `tokenMiddleware` + `requireRole('ADMIN')`. `GET`/`GET :id` require `tokenMiddleware` and are role-scoped: ADMIN sees all; RETAILER sees deliveries for pools they've joined; SUPPLIER sees deliveries for pools built from their own offers (union of both when a caller holds both roles).
- **Still missing:** no notification (and no `Pool.status` update — see §3) when a delivery's own status changes (`PENDING → DELIVERING → DELIVERED`, via generic `PATCH /deliveries/:id`, which goes through unmodified `BaseController.update` with no side effects at all). Only *assignment* (creation) is wired to anything.

---

## 5. Complaints

- Unchanged model shape from the last pass: `pool_ref`/`creator_ref`/`title`/`description`/`priority(LOW|MEDIUM|HIGH)`/`status(OPEN|'UNDER REVIEW'|RESOLVED)`/`resolution`.
- **Resolved from the old snapshot:** `status` **is** now in `couldBeUpdated`, and `ComplaintController.update()` (not generic `BaseController.update`) enforces the split: the filer may only edit `title`/`description`/`priority`; `ADMIN` may edit anything, including `status`/`resolution`, on any complaint. The old "even the existing 3-value status can't be moved via the API" gap is closed.
- `GET`/`GET :id`/`PATCH :id` require `tokenMiddleware` (role-scoped inside the controller: ADMIN sees/edits all, everyone else only what they filed); `POST` additionally requires `requireRole('RETAILER', 'SUPPLIER')`; `DELETE` requires `requireRole('ADMIN')`. This closes the "PATCH is still unauthenticated" note from the last pass.
- **Still missing, unchanged:** no conversation/message thread entity (`resolution` is still one free-text field, not a thread — `grep` for "message" under `src/services` still returns nothing complaint-related). No fault-classification field (supplier vs. OrderPool-operations root cause). No automatic `Notification` on complaint state changes (new complaint → admin, supplier implicated → supplier, resolved → retailer) — `Notification.type` still has no complaint-related value (§9).

---

## 6. Supplier Management

- Unchanged from the last pass: suppliers are `User` documents holding `SUPPLIER` in `roles[]` — no separate collection, `GET /users/:id` populates `addresses`.
- Missing, unchanged: no `?role=SUPPLIER` filtering on `GET /users` (cross-cutting `list()` gap, §11) — `UsersController.list()` still does a bare `this.model.find().select('-password')`, ignoring `req.query` entirely.
- Missing, unchanged: no aggregated "supplier profile" view — achievable today by filtering `product.offers`/`complaints` by `user_ref`/`creator_ref` per entity, but no convenience endpoint exists.
- New surface, not in scope of the original spec but relevant here: a `SUPPLIER` can no longer just delete their own account outright — see §12.

---

## 7. Supplier Requests — now fully implemented

**Closed. The prior "no such entity" gap from the 2026-08-28 snapshot is fully resolved — this section previously described §7 and §8 together as missing; both are done.**

- `src/services/supplier.requests/` exists end to end: `supplier.request.model.ts` (`user_ref`, `description`, `status: PENDING|APPROVED|REJECTED`, `adminComment`), controller, Zod schemas, routes, wired into `src/routes/api/v1/index.ts`.
- The actual design differs from what the old doc assumed (a public, anonymous applicant form with name/email/company/message and an open question about password provisioning): a request is filed by an **already-registered, authenticated `RETAILER`** who isn't already a `SUPPLIER` (`requireRole('RETAILER')` + a controller check blocking existing suppliers), always under their own `user_ref` (never client-supplied). There's no separate applicant identity to provision a password for — the old "open design question" about password generation is moot under this design, since approval just adds a role onto an existing account rather than creating a new one.
- `POST` creates (blocks a second `PENDING` request per user, 409). `GET`/`GET :id` are role-scoped (ADMIN sees all, RETAILER sees only their own). `PATCH :id` splits permissions: the owning RETAILER may only edit `description`, and only while still `PENDING`; ADMIN may only set `status`/`adminComment`, and only on a still-`PENDING` request. Approving (`status: 'APPROVED'`) does `$addToSet: { roles: 'SUPPLIER' }` on the underlying `User` — additive, never replacing `RETAILER`. `DELETE :id` lets the owner withdraw their own request or ADMIN delete any.
- Missing: no automatic `Notification`/email when a request is approved/rejected (the applicant has to notice via `GET /supplier-requests` themselves) — `Notification.type` has no value for it (§9), and while email infra (`nodemailer` + `AppBroker`) exists and is proven out (used for registration welcome emails), nothing wires it to this event.

---

## 8. (folded into §7 above — see note there)

The old doc's §7 and §8 were two views of the same gap (no `SupplierRequest` entity). Now that it exists, splitting them no longer makes sense; kept as a stub heading only so section numbers below stay stable relative to the prior version of this document.

---

## 9. Notifications

- Model was restructured since the last pass (see Methodology) — `recipients: [{ user_ref, isRead, readAt }]` instead of a flat `recipient_ref[]` + shared `isRead`/`readAt`, giving genuine per-recipient read state. `NotificationController` has a private `notify()` helper used both by the admin-facing `POST` and by every business-event listener, plus a `scopeToRecipient()` helper that strips every recipient entry except the caller's own before a non-admin ever sees a notification document (so a RETAILER/SUPPLIER can never see who else a notification went to).
- `type` enum was narrowed to `'DELIVERY_ASSIGNED'` only — the old `PRODUCT_APPROVED`/`NEW OFFER`/`NEW COMPLAINT` values are gone, not extended, and there is no offer-rejected/negotiation-requested/supplier-request-decided/complaint-related value yet. Extending this remains a small, additive change (`src/services/notifications/notification.model.ts`'s `NotificationType` union + schema enum) — the mechanism (`AppBroker` event → `NotificationController.listeners()` → `notify()`) is proven out by the one trigger that exists.
- `couldBeUpdated` covers ADMIN content edits (`title`/`message`/`actionUrl`/`priority`); a recipient may additionally patch only their own `recipients[].isRead` (and `readAt` is derived server-side, not client-settable) — this is enforced in `update()`, not expressible as a static whitelist.
- **Resolved from the old snapshot:** one real trigger now exists end to end — `EVENTS.DELIVERY_ASSIGNED`. This is still the *only* wired trigger; every other admin/business action that should notify someone (offer approved/rejected/negotiation-requested, supplier request approved/rejected, complaint filed/resolved, delivery status changed post-assignment) still creates zero notifications, because none of those actions have a corresponding event raised yet — this is a direct consequence of §2/§5/§7's remaining gaps, not an independent notifications-layer problem.

---

## 10. Historical Data

- The status-based soft-close pattern (`ProductOffer.status`, `Pool.status`, `Complaint.status`, `SupplierRequest.status`, `SupplierRemoveRequest.status`) remains the right mechanism and is well-established now across five entities.
- **Resolved from the old snapshot — down to two entities.** `DELETE` is now behind `tokenMiddleware` + either `requireRole('ADMIN')` or an owner-or-ADMIN controller check on: `addresses`, `complaints`, `deliveries`, `notifications`, `pool.participants`, `pools`, `product.offers`, `supplier.remove.requests`, `supplier.requests`, `users`.
- **Still a real, active gap on exactly two entities:** `payments` and `supplier.payouts` — both still plain `BaseController` with zero route-level auth of any kind (see §1). `DELETE /api/v1/payments/:id` and `DELETE /api/v1/payouts/:id` will hard-delete a financial record for anyone, authenticated or not.

---

## 11. Cross-Cutting Gaps

- **No generic query filtering.** `BaseController.list()` still calls `this.model.find()` with no arguments and never reads `req.query`. Every controller that needs role-based scoping has grown its own bespoke `list()` override (11+ of them now, all hand-rolled and slightly different) rather than there being one reusable filter-building mechanism — this works but means every future "filter list X by Y" requirement is still its own from-scratch override, and there's still no way for a client to ask for e.g. `GET /offers?status=PENDING` on top of the role scoping that already exists.
- **Auth is now broad but not universal.** `tokenMiddleware`/`requireRole` cover essentially the whole API except `payments` and `supplier.payouts` (§1) — a major change from the old snapshot ("almost no route has auth"), but those two remaining modules are a real, currently-exploitable gap, not a rounding error.
- **No multi-document transactions anywhere.** Still true. The pool-join guard (§3) works around this for its one case using a single-document atomic `findOneAndUpdate` with an `$expr` filter + aggregation-pipeline update — a real, working pattern now available to copy for similar problems — but it only solves single-document atomicity. Multi-document admin actions this spec still calls for (approve offer → create Pool; delivery reaches DELIVERED → pool COMPLETED) still have no session/transaction to build on, and the local dev `docker-compose.yml` runs a standalone `mongo:6` (no replica set), which doesn't support multi-document transactions at all without also changing the deployment topology — worth deciding deliberately before this is needed, not assuming it'll just work.

---

## 12. Account Removal Workflow (new since last pass, not in the original spec)

Added this session, follows the same request/approval shape as §7 rather than extending it (different trigger, different reviewer expectations — a removal is higher-stakes than a role grant).

- `src/services/supplier.remove.requests/` — model (`user_ref`, `reason`, `status: PENDING|APPROVED|REJECTED`, `adminComment`), controller, Zod update schema, routes. **No `POST` route** — a request is only ever created as a side effect of `AuthController.remove()` (see §1a), never posted directly by a client.
- `GET`/`GET :id` are role-scoped (ADMIN sees all, everyone else only their own). `PATCH :id` is ADMIN-only; approving deletes the requester's `User` and `Auth` records outright. `DELETE :id` lets the owner withdraw their own still-`PENDING` request, or ADMIN delete any regardless of status.
- Missing (matches a note already in §7 for the mirror-image role-grant flow): no automatic `Notification`/email when a removal request is approved/rejected.
- **Explicitly out of scope so far, worth a product decision:** approving a removal request just deletes the `User` — it does not check for open pools, pending payouts, or in-flight `PoolParticipant` rows tied to that supplier first. No referential-integrity check exists anywhere else in the codebase either (consistent with the project's stated "no transactional logic exists yet, add it deliberately" stance), so this wasn't treated as a special case, but it means an admin can currently approve a removal out from under a supplier with an active pool.

---

## Summary

```text
Already implemented (new or newly-closed since 2026-08-28):
- Multi-role User.roles[] (additive role grants, requireRole matches any overlap)
- SupplierRequest: full model/controller/routes/schema, role-scoped, split PATCH permissions, additive role grant on approval
- ProductOffer: Product entity dropped, offer is now self-contained; status is patchable with owner/admin field-split enforcement; rejectedAt TTL auto-delete
- Complaint: status/resolution now patchable with owner/admin field-split enforcement
- Pool: startDate is a real field; OPEN -> TARGET_REACHED now auto-triggered (join-only) via an atomic single-document update
- Pool join guard: minimumContribution <= quantity <= currentQuantity, no invalid nonzero remainder, race-safe without transactions
- Delivery -> Notification: DELIVERY_ASSIGNED event wired end to end (supplier + every participant notified)
- Notification: per-recipient read state (recipients[] replacing flat recipient_ref[])
- Auth: /auth/logout (clears persisted refresh token, /auth/refresh now checks it) and /auth/remove (retailer: immediate delete; supplier: SupplierRemoveRequest for admin review)
- SupplierRemoveRequest: full model/controller/routes/schema mirroring SupplierRequest's shape
- Role-scoped auth now covers addresses, complaints, deliveries, notifications, pool.participants, pools, product.offers, supplier.remove.requests, supplier.requests, users
- Jest test suite wired up and substantial (23 suites / 335+ tests as of this pass)

Still missing (confirmed still true, re-verified against current code):
- Auth/authz entirely absent on payments and supplier.payouts (the most exposed modules in the API today)
- Approve-offer workflow that atomically creates the Pool (still two uncoordinated calls)
- Request-negotiation / reject-offer dedicated actions + supplier notifications
- Generic query filtering/pagination on list() (still per-controller bespoke overrides, no shared mechanism, no arbitrary client-side filters e.g. ?status=)
- SUPPLIER-visible "participants of my own pool" listing (admin-only and self-only today)
- TARGET_REACHED -> DISTRIBUTING -> COMPLETED pool transitions (delivery creation/completion doesn't move Pool.status)
- Notification on delivery status change post-assignment (PENDING -> DELIVERING -> DELIVERED)
- Complaint conversation/message thread; supplier-vs-OrderPool fault classification; complaint-driven notifications
- Supplier-by-role filtering (?role=SUPPLIER) / supplier profile aggregation
- Notification.type coverage for offer-rejected/negotiation-requested/supplier-request-decided/removal-request-decided/complaint events
- Multi-document transactions (still none; only one single-document atomic-update workaround exists, for pool joins)
- Referential-integrity check before approving a SupplierRemoveRequest (open pools/payouts not checked)

Needs model:
- ComplaintMessage / complaint conversation entity (still not started)

Needs controller/service:
- ProductOffer: approve / requestNegotiation / reject actions (atomic with Pool creation where relevant)
- Pool: participants-by-pool listing for the owning SUPPLIER; TARGET_REACHED->DISTRIBUTING->COMPLETED transition logic
- Complaint: add message; classify fault
- Payments / SupplierPayouts: any business logic and auth at all (currently bare CRUD)
- Cross-cutting: a reusable query-filter mechanism for BaseController.list (or a documented override pattern) so future filters aren't all bespoke

Needs route:
- POST /offers/:id/approve, /offers/:id/negotiate, /offers/:id/reject
- GET /pools/:id/participants (or equivalent SUPPLIER-scoped filter on the existing endpoint)
- POST /complaints/:id/messages, PATCH .../classify
- tokenMiddleware + requireRole applied to payments and supplier.payouts

Needs validation:
- Zod schemas for every new route above

Needs notification:
- Notification.type enum extended for: offer negotiation requested, offer rejected, supplier request approved/rejected, removal request approved/rejected, delivery status changed, complaint filed/resolved
- Trigger points (AppBroker events + listeners) wired into each new controller action above, following the DELIVERY_ASSIGNED pattern already proven out
```
