# Unimplemented Features — Admin / Business Owner Workflow

> Gap analysis produced by inspecting `src/` on 2026-08-28 against the Admin workflow spec below. This is a snapshot, not a commitment — re-verify against the code before treating a line here as still accurate, and before starting each item confirm nothing else touched it in the meantime. Nothing in this document has been implemented yet; it exists so we can agree on scope and work through it one item at a time, each with tests.

## Methodology

Before writing this, the following were inspected directly (not assumed from docs): every model in `src/services/*/*.model.ts` and its `couldBeUpdated` whitelist, every controller for custom (non-CRUD) methods, every `*.routes.ts` for which middleware is actually applied, `src/middlewares/token.middleware.ts`, `src/utils/jwt.util.ts`, `src/constants/{REGISTRY,ERRORS}.ts`, `BaseController.list/update/delete`, and the repo for any seed script or `SupplierRequest`/message/conversation model. Findings below are what that inspection actually showed, not inference from the docs folder.

---

## 1. Admin Account / Authorization

**Foundation done (commit `0af128a`, "implement the Auth/role foundation with unit testing"); repo-wide rollout still outstanding.**

- Done: `AuthController.register`/`login` now sign `{ _id, role }` into the JWT (`src/services/auth/auth.controller.ts`), typed via `jwt.util.ts`'s `JwtPayload.role: UserRole`.
- Done: `tokenMiddleware` (`src/middlewares/token.middleware.ts`) decodes and attaches `role` onto `req.meta.user`, not just `userId`. Covered by `tests/middlewares/token.middleware.test.ts` and `tests/utils/jwt.util.test.ts`.
- Done: `requireRole(...roles)` middleware now exists (`src/middlewares/require-role.middleware.ts`) — 401 if no `req.meta.user`, 403 if role not in the allowed set. Covered by `tests/middlewares/require-role.middleware.test.ts`.
- Done: `scripts/seed-admins.ts` (`npm run seed:admins`) seeds the two predefined admin accounts from `SEED_ADMIN_{1,2}_EMAIL`/`_PASSWORD` env vars, idempotent, no public endpoint involved.
- **Only partially rolled out:** full `tokenMiddleware`/`requireRole` coverage exists on `complaints` (§5) and `deliveries` (§4). `DELETE` also requires `requireRole('ADMIN')` on `pools` and `product.offers`. Every other route in the app, including `DELETE` on `addresses`, `pool.participants`, `payments`, `notifications`, `supplier.payouts`, `products`, and `users`, is still completely unauthenticated (confirmed by grep of every `*.routes.ts` on 2026-08-29). `shipments`/`distribution.batches` were removed entirely this session (§4) rather than authenticated.
- `createUserSchema`/`registerSchema` still correctly omit `role` from client input.

**Still needed:** apply `tokenMiddleware` (+ `requireRole` where relevant) to the remaining routes this spec covers — every section below (§2–§10) still assumes no auth exists on its routes except where explicitly noted otherwise.

---

## 2. Supplier Product Offers

**Model/status vocabulary already fits the spec well — the workflow logic to drive it does not exist.**

- Already implemented: `ProductOffer` model (`product_ref`, `wholeQuantity`, `price`, `status: PENDING|NEGOTIATION|APPROVED|REJECTED`, `adminComment`), generic CRUD, Zod create/update schemas.
- **Blocking gap:** `status` is not in `ProductOffer.couldBeUpdated` (`['wholeQuantity', 'price', 'adminComment']`). Nothing today — not even a raw `PATCH` — can move an offer off `PENDING`. The entire approve/negotiate/reject workflow is currently impossible through the API, not just "unimplemented as a nice endpoint."
- Missing: an approve action that (1) validates the Pool params, (2) creates the `Pool` referencing the offer, (3) sets `ProductOffer.status = 'APPROVED'`, atomically. Today these would be two independent, uncoordinated calls (`POST /pools` then a status patch that isn't even allowed).
- Missing: a "request negotiation" action — set `status = 'NEGOTIATION'` + create a `Notification` to the supplier with an `actionUrl`. No such endpoint exists, and per this spec (and the fact that a `meetings` service was already built and then deliberately removed from this repo) this should reuse `Notification.actionUrl`, not a new meetings system.
- Missing: a reject action requiring a reason, setting `status = 'REJECTED'`, storing the reason (`adminComment` already fits), and notifying the supplier.
- Missing: filtering `GET /offers` by status (pending vs. historical) — see the cross-cutting `list()` gap in §11.
- Not missing / no change needed: soft-close via `status`, keeping the row for history — the model already supports this, `DELETE /offers/:id` is the only thing that threatens it (see §10).

---

## 3. Pool Management

- Already implemented: `Pool` model with `status: OPEN|TARGET_REACHED|DISTRIBUTING|COMPLETED|CANCELLED`, and (unlike `ProductOffer`) `status` **is** in `couldBeUpdated`, so it's at least patchable today.
- Known backend bug relevant here: `Pool.startDate` is declared in the TS interface but was never added as an actual field in the Mongoose schema — it will never persist or come back from the API despite being listed in `couldBeUpdated`. Worth fixing as part of this work, not treating as intentional.
- Vocabulary note: the spec's conceptual lifecycle (`ACTIVE → MET → DELIVERY ASSIGNMENT → DELIVERED → CLOSED`) doesn't map one-to-one onto the existing enum. The closest mapping is `OPEN≈ACTIVE`, `TARGET_REACHED≈MET`, `DISTRIBUTING≈DELIVERY ASSIGNMENT`, `COMPLETED≈DELIVERED`. There is **no distinct "CLOSED" status** — `CANCELLED` is the only other terminal state, and it means failed/cancelled, not "successfully wrapped up." Per the spec's own instruction ("use the exact status names already present"), this should be flagged and confirmed rather than inventing a new `CLOSED` value.
- Missing: filtering `GET /pools` by status (active vs. met vs. closed) — cross-cutting `list()` gap, §11.
- Missing: a way to view the participants of one pool — `PoolParticipant` has `pool_ref`, but nothing filters by it; `GET /participants` returns everyone.
- Missing: anything that computes/enforces the `OPEN → TARGET_REACHED` transition. `currentQuantity` is manually patchable today; nothing flips `status` when it reaches `minimumContribution`/the offer's `wholeQuantity`.

---

## 4. Delivery Assignment

**Simplified this session**: `Shipment` and `DistributionBatch` were removed entirely from the MVP — they carried no linkage/validation logic anyway (the gap this section used to describe) and added three uncoordinated CRUD endpoints for no behavior. `Delivery` now relates directly to `Pool`.

- `Delivery.pool_ref` (unique — one delivery per pool) replaces the old `batch_ref`. `DeliveryController.create()` enforces: the pool must exist (404), `Pool.status` must not be `OPEN`/`CANCELLED` (409 otherwise — i.e. the pool must have reached its target), and no delivery may already exist for that pool (409 otherwise).
- `POST/PATCH/DELETE /deliveries` all require `tokenMiddleware` + `requireRole('ADMIN')` — only an admin manages deliveries.
- `GET /deliveries`(`/:id`) require `tokenMiddleware` and are role-aware: ADMIN sees/fetches every delivery; RETAILER sees deliveries for pools they've joined (via `PoolParticipant`); SUPPLIER sees deliveries for pools built from their own products (`Pool.productoffer_ref -> ProductOffer.product_ref -> Product.user_ref`).
- Still missing: any notification triggered when a delivery is created or its status changes (see §9).

---

## 5. Complaints

- Already implemented: `Complaint` model — restructured (this session) to `pool_ref` -> Pool and `creator_ref` -> User (the retailer or supplier who filed it) in place of the original `delivery_ref`/`retailer_ref`, plus `title`, `description`, `priority: LOW|MEDIUM|HIGH`, `status: OPEN|'UNDER REVIEW'|RESOLVED`, `resolution`. Generic CRUD + Zod schemas.
- Note: a complaint is now tied to a `Pool`, not a `Delivery` — an admin walks `Pool` -> `ProductOffer`/`PoolParticipant`/`Delivery` from `pool_ref` to get the details needed to act, rather than the complaint carrying a direct delivery link.
- **Missing entirely:** a conversation/message model. There is no `ComplaintMessage` (or similar) anywhere in the codebase — `grep` for "message" under `src/services` returns nothing. `Complaint.resolution` is a single free-text field, not a thread. "Exchange messages with the relevant party" has zero backing today.
- Missing: a field/mechanism to record whether the root cause was the supplier or OrderPool/business operations — no such field exists on `Complaint`.
- Missing: `status` is **not** in `Complaint.couldBeUpdated` (`['title', 'description', 'priority', 'resolution']`) — so even the existing 3-value status can't be moved via the API today.
- Done (commit `0af128a`, refined this session): `POST /complaints` now requires `tokenMiddleware` + `requireRole('RETAILER', 'SUPPLIER')` — only the affected party can file a complaint; ADMIN gets 403 and cannot file on someone's behalf. `ComplaintController.create()` always forces `creator_ref` to the caller's own `userId` (any client-supplied value is ignored; the Zod schema doesn't even accept the field). `GET /complaints`(`/:id`) require `tokenMiddleware` and are role-aware — admins see/fetch every complaint, everyone else only complaints where `creator_ref` is their own `userId` (403 on `getById` otherwise). `DELETE /complaints/:id` requires `requireRole('ADMIN')`. `PATCH /complaints/:id` is still unauthenticated — not yet addressed.
- Missing: automatic `Notification` creation tied to complaint state changes (new complaint → notify admin; supplier implicated → notify supplier; resolved → notify retailer).
- Not missing: the 3-value status (`OPEN|UNDER REVIEW|RESOLVED`) reasonably covers the spec's "resolved/closed" end state already — no extra status value looks necessary.

---

## 6. Supplier Management

- Already implemented: suppliers are `User` documents with `role: 'SUPPLIER'` — the single shared User model the spec asks for, no separate collection. `GET /users/:id` already populates `addresses`.
- Missing: filtering `GET /users` by `role` — there is no way to list "just suppliers" today (cross-cutting `list()` gap, §11).
- Missing: any aggregated "supplier profile" (their products, offers, complaints) — achievable by filtering the existing per-entity endpoints by `user_ref`/`creator_ref` once query filtering exists (§11); no new model needed, just the filtering capability plus, likely, a couple of convenience routes.

---

## 7 & 8. Supplier Requests / `SupplierRequest` Model

**Confirmed via inspection: no existing entity covers this. A new model is genuinely warranted**, exactly as the spec's own fallback instructs.

- No `SupplierRequest` model, controller, routes, or schema exist anywhere (`find`/`grep` across `src/services` for `supplier.request`/`supplierRequest` returns nothing).
- `User.role = 'SUPPLIER'` is not a substitute — the spec is explicit that a request must not auto-create a Supplier, and today there's no pending/reviewable state between "someone emailed us" and "a User with role SUPPLIER exists."
- Needed: a new `src/services/supplier.requests/` module following the existing service-module convention (`supplier.request.model.ts` with `couldBeUpdated`, `.controller.ts`, `.routes.ts`, `.schema.ts`, `index.ts`), registered in `src/routes/api/v1/index.ts`.
- Minimum fields per the spec: applicant name/email/company/message (mirrors the existing `SupplierRequest` shape already drafted on the frontend — see `applicantName`/`applicantEmail`/`companyName`/`message`), `status: PENDING|APPROVED|REJECTED`, `reviewedAt`, `reviewedBy` (admin ref), `rejectionReason`, `resultingUser_ref` (set on approval).
- **Open design question, not something to decide unilaterally:** the spec says approval must "create the Supplier using the existing... registration/business rules," but `User.password` is required and a supplier request (per the fields listed) doesn't collect one. Whether approval auto-generates a temporary password/invite link, or the applicant sets one via a follow-up flow, needs a product decision before this is built — flagging rather than guessing.

---

## 9. Notifications

- Already implemented: `Notification` model already has everything structurally needed — `sender_ref`, `recipient_ref` (array, so multi-recipient is already supported), `type`, `title`, `message`, `actionUrl` (free string, exactly the mechanism the spec wants reused instead of a meetings system), `priority`, `isRead`/`readAt`, Zod schemas, and (fixed this session) a working `couldBeUpdated: ['isRead', 'readAt']`.
- Missing: `type` enum only has `'PRODUCT_APPROVED' | 'NEW OFFER' | 'NEW COMPLAINT'` — doesn't yet cover offer-rejected, negotiation-requested, supplier-request decided, or delivery-update alerts this workflow needs. This is an enum extension on the existing model, not a new model.
- Not missing: the `actionUrl`-as-plain-string mechanism is sufficient for "supplier books a meeting" per the spec's own instruction not to build a separate meetings system — e.g. a `mailto:` link to the admin, matching the pattern `emails.controller.ts` already uses for verification links. No new field needed.
- No notifications are triggered by any admin action yet, because none of those admin actions exist yet — this is a consequence of §2–§8, not an independent gap.

---

## 10. Historical Data

- The status-based soft-close pattern (`ProductOffer.status`, `Pool.status`, `Complaint.status`) already exists and is the right mechanism — no new soft-delete concept is needed, matching the spec's instruction.
- **Partially fixed (commit `0af128a`):** `DELETE` on `complaints`, `pools`, and `product.offers` now requires `tokenMiddleware` + `requireRole('ADMIN')`.
- **Active violation on every other entity:** every entity's generic `BaseController.delete()` still does a real `this.model.deleteOne(...)` — a hard delete — and `DELETE /:_id` on `addresses`, `pool.participants`, `payments`, `notifications`, `supplier.payouts`, `products`, and `users` is still wired up with zero authentication (confirmed by grep on 2026-08-29; `deliveries` closed this session, §4). Anyone can still `DELETE /api/v1/users/:id` and permanently destroy a historical record. This needs the same `tokenMiddleware` + `requireRole('ADMIN')` treatment applied to the rest.

---

## 11. Cross-Cutting Gaps (affect almost every section above)

These aren't per-entity — they're shared infrastructure this whole spec depends on, confirmed by reading the actual implementations:

- **No query filtering anywhere.** `BaseController.list()` calls `this.model.find()` with no arguments — `req.query` is never read. Every "view active vs. pending vs. historical X" requirement in this spec (offers, pools, complaints, supplier requests, suppliers-by-role) needs this before it can work.
- **No authentication on almost any route.** `tokenMiddleware`/`requireRole` now exist (§1) and are wired onto `GET /auth/me`, `DELETE` on complaints/pools/product.offers, and `GET /complaints`. Every other route this spec describes — the vast majority of the API — still has none.
- **No transactions anywhere in the codebase.** Multi-document admin actions this spec asks for (approve offer → create Pool; approve supplier request → create User) touch more than one collection and should use a Mongoose session per the project's own standing instruction on data integrity — none exist yet to build on or copy from.

---

## Summary

```text
Already implemented:
- User model covering all three roles (ADMIN/SUPPLIER/RETAILER), no separate collections needed
- ProductOffer model + status enum (PENDING/NEGOTIATION/APPROVED/REJECTED) — vocabulary already matches the spec
- Pool model + status enum (OPEN/TARGET_REACHED/DISTRIBUTING/COMPLETED/CANCELLED)
- Delivery model tied directly to Pool (`pool_ref`, unique) — Shipment/DistributionBatch removed from the MVP this session (§4)
- Delivery access control: create/update/delete ADMIN-only (with pool-readiness + one-per-pool checks); retailer/supplier list/get scoped to their own pools (§4)
- Complaint model with pool_ref/creator_ref/priority/status/resolution
- Notification model with recipient_ref array, actionUrl, priority, isRead/readAt (couldBeUpdated fixed this session)
- Generic CRUD + Zod validation for every entity above
- Email delivery infra (nodemailer + AppBroker event pattern) usable for supplier-request approval/rejection emails
- Role-aware JWT (role signed at login/register) + `tokenMiddleware` attaching role + `requireRole(...roles)` middleware + admin seed script (`npm run seed:admins`), all with unit tests (commit `0af128a`)

Partially implemented:
- ProductOffer/Complaint status fields exist but are excluded from couldBeUpdated — can't be transitioned via the API at all today
- Pool.startDate is in the TS interface and couldBeUpdated but not actually in the Mongoose schema (dead field)
- Notification.type enum exists but doesn't cover this workflow's needed alert types
- Historical-record durability exists via status fields; `DELETE` is now auth-protected on complaints/pools/product.offers only — every other entity's `DELETE` route is still unauthenticated
- Auth/role foundation exists (JWT, tokenMiddleware, requireRole) but is only wired onto complaints/pools/product.offers `DELETE` + `GET /complaints` — every other route in the app still has zero authentication

Missing:
- Repo-wide rollout of `tokenMiddleware`/`requireRole` onto the remaining routes this spec covers (the foundation itself is no longer missing, see above)
- Approve-offer workflow (validate params -> create Pool -> set ProductOffer APPROVED, atomically)
- Request-negotiation workflow (set NEGOTIATION status -> notify supplier with actionUrl)
- Reject-offer workflow (reason required -> set REJECTED -> notify supplier)
- Query filtering/pagination on list() (blocks "active vs pending vs historical" everywhere)
- Pool -> participants view; Pool target-reached auto status transition
- Notification triggered when a delivery is created or its status changes (§9)
- Complaint conversation/message thread; supplier-vs-OrderPool fault classification; complaint-driven notifications
- Supplier-by-role filtering / supplier profile aggregation
- Entire SupplierRequest workflow (model, approve/reject actions, emails)
- Protection against hard-deleting historical entities (offers, pools, complaints, supplier requests)

Needs model:
- SupplierRequest (new)
- ComplaintMessage / complaint conversation entity (new)

Needs controller/service:
- ProductOffer: approve / requestNegotiation / reject actions
- Pool: participants-by-pool listing (delivery creation is now handled directly by `DeliveryController.create()`, §4 — no separate Pool action needed)
- Complaint: add message; classify fault; status transition
- SupplierRequest: full controller (create/list/approve/reject)
- Cross-cutting: generic query-filter support in BaseController.list (or a documented override pattern) — role-checking middleware itself now exists (`requireRole`, §1), just not applied broadly yet

Needs route:
- POST /offers/:id/approve, /offers/:id/negotiate, /offers/:id/reject
- POST /pools/:id/assign-delivery, GET /pools/:id/participants
- POST /complaints/:id/messages, PATCH .../classify
- Full /supplier-requests CRUD + /supplier-requests/:id/approve|reject
- `tokenMiddleware` + `requireRole` (both already built, §1) applied across all of the above and to the remaining unauthenticated sensitive routes (DELETE on addresses, pool.participants, payments, notifications, supplier.payouts, products, users)

Needs validation:
- Zod schemas for every new route above (approve/reject/negotiate payloads, assign-delivery payload, SupplierRequest create, message create)

Needs notification:
- Notification.type enum extended for: offer negotiation requested, offer rejected, supplier request approved/rejected, delivery assigned/updated
- Trigger points wired into each new controller action above
```
