# Unimplemented Features — Admin / Business Owner Workflow

> Gap analysis produced by inspecting `src/` on 2026-08-28 against the Admin workflow spec below. This is a snapshot, not a commitment — re-verify against the code before treating a line here as still accurate, and before starting each item confirm nothing else touched it in the meantime. Nothing in this document has been implemented yet; it exists so we can agree on scope and work through it one item at a time, each with tests.

## Methodology

Before writing this, the following were inspected directly (not assumed from docs): every model in `src/services/*/*.model.ts` and its `couldBeUpdated` whitelist, every controller for custom (non-CRUD) methods, every `*.routes.ts` for which middleware is actually applied, `src/middlewares/token.middleware.ts`, `src/utils/jwt.util.ts`, `src/constants/{REGISTRY,ERRORS}.ts`, `BaseController.list/update/delete`, and the repo for any seed script or `SupplierRequest`/message/conversation model. Findings below are what that inspection actually showed, not inference from the docs folder.

---

## 1. Admin Account / Authorization

**Missing — this blocks everything else in this document.**

- `AuthController.register`/`login` sign JWTs with `{ _id }` only (`src/services/auth/auth.controller.ts`) — **no `role` is ever put in the token.** `refresh()` destructures `role` off the decoded payload, but since it was never signed in, it is always `undefined` there too.
- `tokenMiddleware` (`src/middlewares/token.middleware.ts`) only verifies the token and sets `req.meta.user.userId` — it never reads or attaches `role`.
- There is no role-checking middleware anywhere in the codebase (`grep`-confirmed: no `requireRole`/`isAdmin`/`authorize`/`checkRole` exists).
- `tokenMiddleware` itself is applied to exactly one route today: `GET /auth/me`. Every other route — including every route this spec needs to protect — currently has **no authentication at all**.
- `createUserSchema`/`registerSchema` correctly omit `role` from client input (so nobody can self-register as ADMIN) — that part is already safe. But there is also no seed script, fixture, or any other mechanism anywhere in the repo to create the two predefined admin accounts. Today the only way to get an `ADMIN` user into the database is a manual Mongo write.

**Needed:** put `role` in the JWT at sign time; have `tokenMiddleware` attach it to `req.meta.user`; add a `requireRole(...roles)` middleware; apply `tokenMiddleware` (+ role check where relevant) to every route this spec covers; add a seed script/mechanism for the two admin accounts (no public endpoint).

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

- Already implemented: `Shipment`, `DistributionBatch` (with `assignedDriver: {name, phone}`), and `Delivery` all exist as real models with generic CRUD + Zod schemas (added this session). No new model is needed here.
- Missing: any linkage between them. Today, assigning a delivery to a pool that hit its target means three independent, uncoordinated calls (`POST /shipments`, then `POST /batches` referencing it, then `POST /deliveries` referencing that) with nothing validating they're consistent with each other or with the `Pool`, and nothing advancing `Pool.status` as a side effect.
- Missing: a single admin-facing "assign delivery" action, and a way to view "the delivery for this pool" without manually walking `Pool → Shipment → DistributionBatch → Delivery` by hand across four separate `GET`s.

---

## 5. Complaints

- Already implemented: `Complaint` model (`delivery_ref`, `retailer_ref`, `title`, `description`, `priority: LOW|MEDIUM|HIGH`, `status: OPEN|'UNDER REVIEW'|RESOLVED`, `resolution`), generic CRUD + Zod schemas.
- Note: `delivery_ref` is required — a complaint is tied to a `Delivery`, not a `Pool`. Any admin complaint view needs to walk that ref, not assume a direct pool link.
- **Missing entirely:** a conversation/message model. There is no `ComplaintMessage` (or similar) anywhere in the codebase — `grep` for "message" under `src/services` returns nothing. `Complaint.resolution` is a single free-text field, not a thread. "Exchange messages with the relevant party" has zero backing today.
- Missing: a field/mechanism to record whether the root cause was the supplier or OrderPool/business operations — no such field exists on `Complaint`.
- Missing: `status` is **not** in `Complaint.couldBeUpdated` (`['title', 'description', 'priority', 'resolution']`) — so even the existing 3-value status can't be moved via the API today.
- Missing: automatic `Notification` creation tied to complaint state changes (new complaint → notify admin; supplier implicated → notify supplier; resolved → notify retailer).
- Not missing: the 3-value status (`OPEN|UNDER REVIEW|RESOLVED`) reasonably covers the spec's "resolved/closed" end state already — no extra status value looks necessary.

---

## 6. Supplier Management

- Already implemented: suppliers are `User` documents with `role: 'SUPPLIER'` — the single shared User model the spec asks for, no separate collection. `GET /users/:id` already populates `addresses`.
- Missing: filtering `GET /users` by `role` — there is no way to list "just suppliers" today (cross-cutting `list()` gap, §11).
- Missing: any aggregated "supplier profile" (their products, offers, complaints) — achievable by filtering the existing per-entity endpoints by `user_ref`/`retailer_ref` once query filtering exists (§11); no new model needed, just the filtering capability plus, likely, a couple of convenience routes.

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
- **Active violation today:** every entity's generic `BaseController.delete()` does a real `this.model.deleteOne(...)` — a hard delete — and every `DELETE /:_id` route is wired up with zero authentication. Right now, literally anyone can `DELETE /api/v1/offers/:id` or `DELETE /api/v1/complaints/:id` and permanently destroy exactly the historical record this spec requires to survive. This needs to be closed off (restrict/remove the `DELETE` route for these entities) as part of this work, not treated as a hypothetical risk.

---

## 11. Cross-Cutting Gaps (affect almost every section above)

These aren't per-entity — they're shared infrastructure this whole spec depends on, confirmed by reading the actual implementations:

- **No query filtering anywhere.** `BaseController.list()` calls `this.model.find()` with no arguments — `req.query` is never read. Every "view active vs. pending vs. historical X" requirement in this spec (offers, pools, complaints, supplier requests, suppliers-by-role) needs this before it can work.
- **No authentication on almost any route.** Only `GET /auth/me` uses `tokenMiddleware`. Every admin operation this spec describes needs auth + the not-yet-existing role check added first (§1).
- **No transactions anywhere in the codebase.** Multi-document admin actions this spec asks for (approve offer → create Pool; approve supplier request → create User) touch more than one collection and should use a Mongoose session per the project's own standing instruction on data integrity — none exist yet to build on or copy from.

---

## Summary

```text
Already implemented:
- User model covering all three roles (ADMIN/SUPPLIER/RETAILER), no separate collections needed
- ProductOffer model + status enum (PENDING/NEGOTIATION/APPROVED/REJECTED) — vocabulary already matches the spec
- Pool model + status enum (OPEN/TARGET_REACHED/DISTRIBUTING/COMPLETED/CANCELLED)
- Shipment, DistributionBatch (with assignedDriver), Delivery models — full fulfillment chain exists
- Complaint model with delivery_ref/retailer_ref/priority/status/resolution
- Notification model with recipient_ref array, actionUrl, priority, isRead/readAt (couldBeUpdated fixed this session)
- Generic CRUD + Zod validation for every entity above
- Email delivery infra (nodemailer + AppBroker event pattern) usable for supplier-request approval/rejection emails

Partially implemented:
- ProductOffer/Complaint status fields exist but are excluded from couldBeUpdated — can't be transitioned via the API at all today
- Pool.startDate is in the TS interface and couldBeUpdated but not actually in the Mongoose schema (dead field)
- Notification.type enum exists but doesn't cover this workflow's needed alert types
- Historical-record durability exists via status fields, but is undermined by unauthenticated hard-delete routes on every entity

Missing:
- Role-aware JWT + role-checking authorization middleware (blocks every admin-only endpoint below)
- Admin account seeding mechanism (no public admin creation, by design — but also no way to create the two seed accounts today)
- Approve-offer workflow (validate params -> create Pool -> set ProductOffer APPROVED, atomically)
- Request-negotiation workflow (set NEGOTIATION status -> notify supplier with actionUrl)
- Reject-offer workflow (reason required -> set REJECTED -> notify supplier)
- Query filtering/pagination on list() (blocks "active vs pending vs historical" everywhere)
- Pool -> participants view; Pool target-reached auto status transition
- Coordinated delivery-assignment action across Shipment/DistributionBatch/Delivery + Pool status update
- Complaint conversation/message thread; supplier-vs-OrderPool fault classification; complaint-driven notifications
- Supplier-by-role filtering / supplier profile aggregation
- Entire SupplierRequest workflow (model, approve/reject actions, emails)
- Protection against hard-deleting historical entities (offers, pools, complaints, supplier requests)

Needs model:
- SupplierRequest (new)
- ComplaintMessage / complaint conversation entity (new)

Needs controller/service:
- ProductOffer: approve / requestNegotiation / reject actions
- Pool: assignDelivery action; participants-by-pool listing
- Complaint: add message; classify fault; status transition
- SupplierRequest: full controller (create/list/approve/reject)
- Cross-cutting: generic query-filter support in BaseController.list (or a documented override pattern), role-checking middleware

Needs route:
- POST /offers/:id/approve, /offers/:id/negotiate, /offers/:id/reject
- POST /pools/:id/assign-delivery, GET /pools/:id/participants
- POST /complaints/:id/messages, PATCH .../classify
- Full /supplier-requests CRUD + /supplier-requests/:id/approve|reject
- Auth + role middleware applied across all of the above and to existing sensitive routes (DELETE especially)

Needs validation:
- Zod schemas for every new route above (approve/reject/negotiate payloads, assign-delivery payload, SupplierRequest create, message create)

Needs notification:
- Notification.type enum extended for: offer negotiation requested, offer rejected, supplier request approved/rejected, delivery assigned/updated
- Trigger points wired into each new controller action above
```
