# Project Scope

> Derived from inspecting `src/services/*/*.model.ts`, `src/services/*/*.controller.ts`, and `src/constants/EVENTS.ts` on 2026-09-12. This is a snapshot — verify against the current models/routes before relying on it for anything load-bearing.

## What OrderPools Is

A B2B group-buying platform. Retailers who individually can't meet a supplier's minimum wholesale order size pool their demand together. A supplier lists a wholesale product offer; an admin approves it and opens a pool for it; retailers join the pool (each paying their own contribution through Thawani); once the pool's quantity target is met, an admin creates its delivery directly against the pool (no separate shipment/batch layer); once delivered, a supplier payout is auto-created for an admin to settle manually.

## Roles

| Role | Responsibility |
|---|---|
| `RETAILER` | Browses (public) `OPEN` pools, joins a pool and pays their contribution via Thawani, tracks deliveries, files complaints, can request to also become a `SUPPLIER`. Default role on signup. |
| `SUPPLIER` | Submits `ProductOffer`s for admin approval, sees pools built from their own offers regardless of status, receives a payout once a pool's delivery completes. Granted additively onto an existing account (usually already `RETAILER`) once an admin approves that account's `SupplierRequest` — never replaces the account's other roles. |
| `ADMIN` | Approves/rejects product offers, creates and manages pools, assigns and progresses deliveries, records supplier payouts, resolves complaints, decides supplier requests and supplier-removal requests. |

`User.roles` is an array (`UserRole[]`, `'ADMIN' | 'SUPPLIER' | 'RETAILER'`) — a single account can hold more than one role at once (most commonly `RETAILER` + `SUPPLIER`), and `requireRole(...)` grants access on *any* overlap with the caller's roles. Authentication (`tokenMiddleware`, attaching `{ userId, roles }` to `req.meta.user`) and role-based authorization (`requireRole`) are applied across essentially every route module today, with controller-level ownership checks layered on top where a route's access depends on *whose* document it is, not just the caller's role — see `docs/unimplemented-features.md` §1 for the current, route-by-route verification and its one deliberate exception (the unauthenticated Thawani webhook).

## Core Domain Flow

```
User (SUPPLIER) --submits--> ProductOffer (PENDING/NEGOTIATION/APPROVED/REJECTED, decided by ADMIN via PATCH)
                                    |
                                    v  (ADMIN creates a Pool from an APPROVED offer; offer/supplier display
                                    |   fields are snapshotted onto the pool at creation time)
                                  Pool (OPEN -> TARGET_REACHED -> DISTRIBUTING -> COMPLETED, or OPEN -> CANCELLED)
                                    ^
                                    |
User (RETAILER) --joins via--> PoolParticipant (user_ref, pool_ref, payment_ref, address_ref, quantity, status:
                                    |    PENDING_PAYMENT -> WAITING -> DELIVERED, or
                                    v    PAYMENT_FAILED / REFUNDED off the happy path)
                                 Payment (one per participant, via Thawani checkout;
                                    PENDING -> COMPLETED -> REFUND_PENDING -> REFUNDED,
                                    or -> FAILED / REFUND_FAILED off the happy path)

Pool --once TARGET_REACHED, admin creates--> Delivery (pool_ref, unique; PENDING -> DELIVERING -> DELIVERED)
                                    |
                                    v  (creating it flips Pool -> DISTRIBUTING; reaching DELIVERED flips
                                    |   Pool -> COMPLETED and every WAITING PoolParticipant -> DELIVERED)
                                    v
                              SupplierPayout (pool_ref, unique; auto-created off DELIVERY_COMPLETED;
                                    PENDING -> PROCESSING -> COMPLETED / FAILED — a manual transfer outside
                                    Thawani, which has no vendor/marketplace payout capability)

Pool --filed against by creator--> Complaint (pool_ref, creator_ref -> User; OPEN -> 'UNDER REVIEW' -> RESOLVED)

User (RETAILER) --files--> SupplierRequest (adds SUPPLIER onto the account once ADMIN-approved)
User (SUPPLIER) --files--> SupplierRemoveRequest (ADMIN-approving it deletes the User + Auth records)

AppBroker events (in-process EventEmitter, src/app.broker.ts):
  user:registered, DELIVERY_ASSIGNED, DELIVERY_COMPLETED,
  PAYMENT_COMPLETED, PAYMENT_FAILED, PAYMENT_REFUNDED
```

A pool has at most one `Delivery` (`pool_ref` is unique) and at most one `SupplierPayout` (`pool_ref` is unique). Only an `ADMIN` can create/update/delete a `Delivery`, and only once `Pool.status` is not `OPEN`/`CANCELLED`. A `RETAILER` sees the delivery for pools they've joined (via `PoolParticipant.pool_ref`); a `SUPPLIER` sees the delivery for pools built from their own offers (`Pool.productoffer_ref -> ProductOffer.user_ref`).

## Entities

Every model lives at `src/services/<name>/<name>.model.ts` and exports a `couldBeUpdated` whitelist consumed by `BaseController.update()` (or, where noted, a controller subclass that further splits which fields a given caller may touch).

- **User** (`users/user.model.ts`) — `firstName/lastName/email(unique)/phoneNumber/companyName/password(bcrypt-hashed)`, `roles: UserRole[]` (defaults `['RETAILER']`, at least one required), `addresses: ObjectId[]` (at least one required, ref `Address`), `commercialRegistration`/`vatNumber` (nullable), `profileImage`, `isVerified` (default `false`), `status` (`ACTIVE`/`SUSPENDED`/`PENDING`, default `PENDING`), `deletedAt`. `couldBeUpdated` includes `roles` itself — `PATCH /users/:id` is ADMIN-only, so an admin can also correct roles directly there, separately from the `SupplierRequest` approval flow that normally grants `SUPPLIER`.
- **Address** (`addresses/address.model.ts`) — `location` (a map URL, not coordinates), `region`, `city`, `street?`. Owned by a `User` via `User.addresses[]` (the reference points from `User`, not from `Address` back to `User`). `POST /addresses` allows anonymous creation (a retailer/supplier provides an address before their account exists, during registration).
- **ProductOffer** (`product.offers/product.offer.model.ts`) — a single, self-contained entity; there is no separate `Product` model or `product_ref` (an earlier `Product`/`ProductOffer` split was removed from the MVP — see "Out of Scope / Removed"). `user_ref` -> `User` (the supplier), `name/description/brand?/unit(PIECE|KG|BOX|CARTON)/images?/wholeQuantity/price`, `status` (`PENDING`/`NEGOTIATION`/`APPROVED`/`REJECTED`, admin-controlled), `adminComment?`, `rejectedAt?` (set on `REJECTED`, cleared otherwise — drives a 7-day TTL auto-delete index, so a rejected offer disappears a week later). `ProductOfferController.update()` splits permissions: the owning `SUPPLIER` may edit product/commercial fields, `ADMIN` may only touch `status`/`adminComment`, on any offer — there's no dedicated approve/negotiate/reject action yet, just a direct `status` `PATCH`.
- **Pool** (`pools/pool.model.ts`) — `productoffer_ref` -> `ProductOffer`. `productName/productDescription/productImageUrl?/unit/supplierName?` are snapshotted from the offer (and its supplier) at creation time, since a `RETAILER` has no read access to `ProductOffer` (which carries the supplier's wholesale price). `targetQuantity` is fixed at creation (== `currentQuantity` at that moment) as a stable denominator for a "collected so far" display, while `currentQuantity` itself counts down as participants join. `minimumContribution`, `pricePerUnit` (the retailer-facing price — the platform's margin is the gap between this and the offer's wholesale `price`), `startDate` (defaults to creation time)/`endDate`, `status` (`OPEN`/`TARGET_REACHED`/`DISTRIBUTING`/`COMPLETED`/`CANCELLED`), `supplierPaymentStatus` (`NOT_PAID`/`PAID`). `status` now advances automatically through most of its lifecycle: `OPEN -> TARGET_REACHED` on a join that fills it exactly (atomic single-document update, `pool.participants.controller.ts`), `TARGET_REACHED -> DISTRIBUTING` when its `Delivery` is created, `DISTRIBUTING -> COMPLETED` when that `Delivery.deliveryStatus` reaches `DELIVERED`, `OPEN -> CANCELLED` via `PoolController.expirePool()` (admin-triggered, only past `endDate`) — and `supplierPaymentStatus` flips to `PAID` when its `SupplierPayout.status` reaches `COMPLETED`. Each of those secondary syncs is a best-effort write (logged, never blocking the primary action), not a transaction; `PoolController.update()` itself still applies no state-machine guard, so an admin can still `PATCH` any of these fields to an illegal value directly. `PoolController.list()`/`getById()` additionally attach a computed `participantCount` (a count of non-abandoned `PoolParticipant`s) that isn't a schema field.
- **PoolParticipant** (`pool.participants/pool.participant.model.ts`) — join table: `user_ref`, `pool_ref`, `payment_ref`, `address_ref` (must be one of `user_ref`'s own addresses — checked in the controller, not expressible as a Mongoose validator), `quantity`, `status` (`PENDING_PAYMENT`/`WAITING`/`PAYMENT_FAILED`/`REFUNDED`/`DELIVERED`). `couldBeUpdated` is empty — `quantity` is fixed once set (it's what the Thawani checkout session was priced against); changing a contribution means withdrawing (`DELETE`, while the pool is `OPEN`, or once `COMPLETED`, or 7+ days after `CANCELLED`) and rejoining fresh.
- **Payment** (`payments/payment.model.ts`) — `pool_ref`, `poolParticipant_ref`, `user_ref`, `amount` (OMR, `quantity * Pool.pricePerUnit`, always server-computed), `currency` (`'OMR'` only), `thawaniSessionId`/`thawaniPaymentId?`/`thawaniRefundId?`, `status` (`PENDING`/`COMPLETED`/`FAILED`/`REFUND_PENDING`/`REFUNDED`/`REFUND_FAILED`). `couldBeUpdated` is empty and there is no generic `POST`/`PATCH` route at all — a `Payment` is only ever created as a side effect of `PoolParticipant` creation, and every transition is a dedicated `PaymentController` action (`confirm`/`cancel`/`retry-refund`/`confirm-refund`) tied to a real Thawani confirmation. See `src/services/thawani/thawani.gateway.ts` for the gateway wrapper and its documented confidence/limitations.
- **Delivery** (`deliveries/delivery.model.ts`) — `pool_ref` -> `Pool` (unique, one delivery per pool), `deliveryStatus` (`PENDING`/`DELIVERING`/`DELIVERED`), `deliveredAt` (a `Date` or the literal string `'Not Set'` — a `Mixed`-typed field, not a clean `Date | null`). Creating one (only once `Pool.status` is `TARGET_REACHED`/`DISTRIBUTING`/`COMPLETED`) moves the pool to `DISTRIBUTING` and raises `DELIVERY_ASSIGNED`; a `PATCH` moving `deliveryStatus` to `DELIVERED` moves the pool to `COMPLETED`, flips every `WAITING` `PoolParticipant` on it to `DELIVERED`, and raises `DELIVERY_COMPLETED` (both side-effect blocks live in `deliveries.controller.ts`).
- **Complaint** (`complaints/complaint.model.ts`) — `pool_ref` -> `Pool`, `creator_ref` -> `User` (the retailer or supplier who filed it), `title/description`, `priority` (`LOW`/`MEDIUM`/`HIGH`, default `MEDIUM`), `status` (`OPEN`/`'UNDER REVIEW'`/`RESOLVED`, default `OPEN`), `resolution`. Not tied directly to a `Delivery` — an admin walks `Pool -> ProductOffer`/`PoolParticipant`/`Delivery` from `pool_ref` to get the details needed to act. `ComplaintController.update()` splits permissions: the filer may only edit `title`/`description`/`priority`; `ADMIN` may edit anything, including `status`/`resolution`, on any complaint.
- **SupplierPayout** (`supplier.payouts/supplier.payout.model.ts`) — `pool_ref` (unique), `amount` (a direct lookup of the pool's `ProductOffer.price` at creation time — never client-supplied, and never derived from actual retailer payments; the platform's margin is fixed by the admin up front, baked into `Pool.pricePerUnit` vs. that price when the pool is created), `status` (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`), `transactionReference?` (the admin's manual bank-transfer reference — Thawani plays no role in this leg), `paidAt?` (auto-stamped on a transition into `COMPLETED` unless explicitly supplied). Auto-created the moment `Delivery.deliveryStatus` transitions to `DELIVERED` (`DeliveryController.update()` raises `DELIVERY_COMPLETED`, consumed by `SupplierPayoutController.listeners()`); `POST /payouts` still exists as an ADMIN-only manual fallback for the rare case the auto-create was skipped (e.g. the pool's product offer couldn't be found at that moment).
- **Notification** (`notifications/notification.model.ts`) — `sender_ref?` (nullable, the admin who triggered it, or null for a fully automated event), `recipients: [{ user_ref, isRead, readAt }]` (genuine per-recipient read state, not a shared flag; at least one recipient required), `type` (currently just `'DELIVERY_ASSIGNED' | 'PAYMENT_COMPLETED' | 'PAYMENT_FAILED' | 'PAYMENT_REFUNDED'`), `title/message/actionUrl?`, `priority` (`LOW`/`NORMAL`/`HIGH`). A private `notify()` helper (shared by the admin-facing `POST` and every `AppBroker` event listener) and a `scopeToRecipient()` helper (strips every recipient entry except the caller's own before a non-admin ever sees the document) live in `notifications.controller.ts`. Only `DELIVERY_ASSIGNED` and the three `PAYMENT_*` events currently drive a notification — offer/supplier-request/complaint/payout events raised on `AppBroker` don't yet (see `docs/unimplemented-features.md` §9).
- **SupplierRequest** (`supplier.requests/supplier.request.model.ts`) — `user_ref` -> `User` (the `RETAILER` asking to also become `SUPPLIER`), `description`, `status` (`PENDING`/`APPROVED`/`REJECTED`), `adminComment?`. Filed by an authenticated `RETAILER` who isn't already `SUPPLIER` (blocks a second `PENDING` request per user, 409). Approving does `$addToSet: { roles: 'SUPPLIER' }` on the `User` — additive, never replacing `RETAILER`.
- **SupplierRemoveRequest** (`supplier.remove.requests/supplier.remove.request.model.ts`) — `user_ref` -> `User`, `reason`, `status` (`PENDING`/`APPROVED`/`REJECTED`), `adminComment?`. **No `POST` route** — created only as a side effect of `AuthController.remove()` when a caller holding `SUPPLIER` asks to delete their own account (a plain `RETAILER` is deleted immediately instead; a `SUPPLIER` can't self-delete outright since they may have open pools/payouts an admin needs to account for first). Approving deletes the requester's `User` + `Auth` records outright — with no referential-integrity check against that supplier's open pools/payouts first (see `docs/unimplemented-features.md` §12).
- **Auth** (`auth/auth.model.ts`) — `userId` -> `User`, `refreshToken`. One record per user, upserted on login, cleared (`refreshToken: ''`) on logout.
- **Email** (`emails/email.model.ts`) — outbound email log (`to/subject/text/html?/sentAt`), auto-expires after 7 days (TTL index on `sentAt`). Not user-facing domain data — a delivery record for what `emails` sends.

## Out of Scope / Removed

- The `Product`/`ProductOffer` split from an earlier version of this spec no longer exists in code — `ProductOffer` is now the single, self-contained entity (see its bullet above). Do not resurrect a separate `Product` model without confirming the product decision to do so.
- A `meetings` service (model/controller/routes) existed at some point but was fully deleted from the working tree. Treat "meetings" as outside current scope unless the user says otherwise — do not resurrect it without asking.
- Redis, BullMQ, and MQTT/event-broker infrastructure are mentioned in `README.md` as intended future pieces but are not present in `package.json` or `docker-compose.yml` today (an in-process `EventEmitter`-based `AppBroker` is used instead — see `docs/tech-stack.md`).
- Stripe was considered early on but is not used in the MVP — the platform integrates exclusively with Thawani for payments (see the Payment entity above and `src/services/thawani/thawani.gateway.ts`).
- `Shipment`/`DistributionBatch` entities were removed from the MVP — a `Delivery` relates directly to a `Pool` via a unique `pool_ref`, with no intermediate shipment/batch layer.
