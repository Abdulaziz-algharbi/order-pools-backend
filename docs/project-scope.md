# Project Scope

> Derived from inspecting `src/` on 2026-08-28. This is a snapshot — verify against the current models/routes before relying on it for anything load-bearing. Note: `User.role` is now `User.roles[]` (multi-role), the `Product` entity was dropped (`ProductOffer` is self-contained), `Notification.recipient_ref[]` is now `recipients: [{user_ref, isRead, readAt}]`, and Payment/PoolParticipant/SupplierPayout below were rewritten for a real Thawani payment-gateway integration — see each entity's note.

## What OrderPools Is

A B2B group-buying platform. Retailers who individually can't meet a supplier's minimum wholesale order size pool their demand together. A supplier lists a wholesale product offer; retailers join a pool for that offer; once the pool's quantity target is met, an admin creates its delivery directly against the pool (no separate shipment/batch layer).

## Roles

| Role | Responsibility (intended) |
|---|---|
| `RETAILER` | Browses product offers, joins pools, pays into a pool, receives deliveries, files complaints. Default role on signup (`User.role` defaults to `RETAILER`). |
| `SUPPLIER` | Creates `Product`s and submits `ProductOffer`s for admin approval, fulfills pools once they close, receives payouts. |
| `ADMIN` | Approves/rejects/negotiates product offers, manages pool lifecycle and supplier payouts, oversees distribution and complaint resolution. |

Roles exist as a `User.role` enum today, but nothing in the codebase currently enforces role-based access on routes — see `docs/implementation-plan.md`.

## Core Domain Flow

```
User (SUPPLIER) --creates--> Product --has--> ProductOffer (PENDING/NEGOTIATION/APPROVED/REJECTED, set by ADMIN)
                                                     |
                                                     v
                                                   Pool (OPEN -> TARGET_REACHED -> DISTRIBUTING -> COMPLETED / CANCELLED)
                                                     ^
                                                     |
User (RETAILER) --joins via--> PoolParticipant (user_ref, pool_ref, payment_ref, quantity, status:
                                                     |    PENDING_PAYMENT -> WAITING -> DELIVERED, or
                                                     v    PAYMENT_FAILED / REFUNDED off the happy path)
                                                  Payment (one per participant, via Thawani checkout;
                                                     PENDING -> COMPLETED -> REFUND_PENDING -> REFUNDED,
                                                     or -> FAILED / REFUND_FAILED off the happy path)

Pool --once TARGET_REACHED, admin creates--> Delivery (pool_ref, unique; PENDING -> DELIVERING -> DELIVERED)

Pool --filed against by creator--> Complaint (pool_ref, creator_ref -> User; OPEN -> UNDER REVIEW -> RESOLVED)

Pool --once Delivery is DELIVERED, admin creates--> SupplierPayout (pool_ref; PENDING -> PROCESSING ->
                                                     COMPLETED / FAILED — a manual transfer outside Thawani,
                                                     which has no vendor/marketplace payout capability)
```

A pool has at most one `Delivery` (`pool_ref` is unique). Only an `ADMIN` can create/update/delete it, and only once `Pool.status` is `TARGET_REACHED`, `DISTRIBUTING`, or `COMPLETED` — not `OPEN` or `CANCELLED`. A `RETAILER` sees the delivery for pools they've joined (via `PoolParticipant`); a `SUPPLIER` sees the delivery for pools built from their own products (`Pool.productoffer_ref -> ProductOffer.product_ref -> Product.user_ref`).

`PoolParticipant.delivery_ref` (a per-participant delivery reference predating the pool-level `Delivery` above) was removed as dead code this session — a retailer's delivery is now found via `Delivery.pool_ref` matching their `PoolParticipant.pool_ref` directly.

## Entities

- **User** — `firstName/lastName/email/phoneNumber/companyName/password`, `role` (ADMIN/SUPPLIER/RETAILER), `addresses` (>=1 required), `commercialRegistration`/`vatNumber` (supplier business identity), `isVerified`, `status` (ACTIVE/SUSPENDED/PENDING).
- **Address** — `location` (map URL), `region`, `city`, `street`. Owned by a `User` via `User.addresses[]` (not the reverse).
- **Product** — owned by a supplier (`user_ref` -> User), `name/description/brand/unit` (PIECE/KG/BOX/CARTON), `images`.
- **ProductOffer** — `product_ref` -> Product, `wholeQuantity`, `price`, `status` (PENDING/NEGOTIATION/APPROVED/REJECTED, admin-controlled), `adminComment`.
- **Pool** — `productoffer_ref` -> ProductOffer, `currentQuantity`, `minimumContribution`, `pricePerUnit`, `startDate`/`endDate`, `status`, `supplierPaymentStatus` (NOT_PAID/PAID). `status` now advances automatically for most of its lifecycle — `OPEN -> TARGET_REACHED` on a join that fills it, `TARGET_REACHED -> DISTRIBUTING` when its `Delivery` is created, `DISTRIBUTING -> COMPLETED` when that `Delivery.deliveryStatus` reaches `DELIVERED`, `OPEN -> CANCELLED` via `PoolController.expirePool` — and `supplierPaymentStatus` flips to `PAID` when its `SupplierPayout.status` reaches `COMPLETED`. Each sync is a best-effort secondary write (logged, never blocking the primary action), not a transaction. `PoolController.update()` still applies no state-machine guard of its own, so an admin can still `PATCH` any of these fields to an illegal value directly.
- **PoolParticipant** — join table: `user_ref`, `pool_ref`, `payment_ref`, `address_ref`, `quantity`, `status` (`PENDING_PAYMENT`/`WAITING`/`PAYMENT_FAILED`/`REFUNDED`/`DELIVERED`). `quantity` is not patchable after creation (it's what the Thawani checkout session was priced against) — withdraw (`DELETE`, while the pool is `OPEN`) and rejoin to change it.
- **Payment** — `pool_ref`, `poolParticipant_ref`, `user_ref`, `amount` (OMR, server-computed), `currency` (`OMR` only), `thawaniSessionId`/`thawaniPaymentId`/`thawaniRefundId`, `status` (`PENDING`/`COMPLETED`/`FAILED`/`REFUND_PENDING`/`REFUNDED`/`REFUND_FAILED`). Created only as a side effect of `PoolParticipant` creation (`pool.participants.controller.ts`), never posted directly; every transition is a dedicated `PaymentController` action tied to a real Thawani confirmation, never a generic `PATCH` (`couldBeUpdated` is empty). See `src/services/thawani/thawani.gateway.ts` for the gateway wrapper and its documented confidence/limitations.
- **Delivery** — `pool_ref` -> Pool (unique, one delivery per pool), `deliveryStatus`, `deliveredAt`. `Shipment`/`DistributionBatch` were removed from the MVP — a delivery is created directly against the pool. Creating one moves its `Pool` to `DISTRIBUTING`; a `PATCH` moving `deliveryStatus` to `DELIVERED` moves the `Pool` to `COMPLETED` and flips every `WAITING` `PoolParticipant` on it to `DELIVERED` (both in `deliveries.controller.ts`), alongside the existing `DELIVERY_COMPLETED` event that auto-creates the `SupplierPayout`.
- **Complaint** — `pool_ref` -> Pool, `creator_ref` -> User (the retailer or supplier who filed it), `title/description`, `priority`, `status`, `resolution`. Not tied directly to a `Delivery` — an admin walks `Pool` -> `ProductOffer`/`PoolParticipant`/`Shipment`/`Delivery` from `pool_ref` to get the details needed to act.
- **SupplierPayout** — `pool_ref` (unique), `amount` (server-looked-up from the pool's `ProductOffer.price` at creation — never client-supplied, and never derived from actual retailer payments; the platform's margin is fixed by the admin up front, baked into `Pool.pricePerUnit` vs. that price when the pool is created), `status` (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`), `transactionReference` (the admin's manual bank-transfer reference — Thawani plays no role in this leg), `paidAt`. Auto-created the moment `Delivery.deliveryStatus` transitions to `DELIVERED` (`DeliveryController.update()` emits `DELIVERY_COMPLETED`, consumed by `SupplierPayoutController.listeners()`); `POST /payouts` still exists as a manual fallback for the rare case the auto-create was skipped (the pool's product offer couldn't be found at that moment).
- **Notification** — `sender_ref` (nullable, may be admin/system), `recipients: [{user_ref, isRead, readAt}]` (per-recipient read state, not a shared flag), `type` (`DELIVERY_ASSIGNED`/`PAYMENT_COMPLETED`/`PAYMENT_FAILED`/`PAYMENT_REFUNDED`), `title/message/actionUrl`, `priority`.
- **Auth** — `userId` -> User, `refreshToken`. One record per user, upserted on login.
- **Email** — outbound email log (`to/subject/text/html/sentAt`), auto-expires after 7 days (TTL index). Not user-facing domain data — a delivery record for `emails` service sends.

## Out of Scope / Removed

- A `meetings` service (model/controller/routes) existed at some point but has been fully deleted from the working tree (uncommitted deletion, along with its `http/meetings.http` file and its registration in `src/routes/api/v1/index.ts`). Treat "meetings" as outside current scope unless the user says otherwise — do not resurrect it without asking.
- Redis, BullMQ, and MQTT/event-broker infrastructure are mentioned in `README.md` as intended future pieces but are not present in `package.json` or `docker-compose.yml` today (an in-process `EventEmitter`-based `AppBroker` is used instead — see `docs/tech-stack.md`).
- Stripe was considered early on but is not used in the MVP — the platform integrates exclusively with Thawani for payments (see the Payment entity above and `src/services/thawani/thawani.gateway.ts`).
