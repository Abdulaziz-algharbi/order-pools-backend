# Project Scope

> Derived from inspecting `src/` on 2026-08-28. This is a snapshot — verify against the current models/routes before relying on it for anything load-bearing.

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
User (RETAILER) --joins via--> PoolParticipant (user_ref, pool_ref, payment_ref, quantity, status)
                                                     |
                                                     v
                                                  Payment (per participant; REQUIRES_CAPTURE -> COMPLETED / REFUNDED)

Pool --once TARGET_REACHED, admin creates--> Delivery (pool_ref, unique; PENDING -> DELIVERING -> DELIVERED)

Pool --filed against by creator--> Complaint (pool_ref, creator_ref -> User; OPEN -> UNDER REVIEW -> RESOLVED)

Pool --funds supplier via--> SupplierPayout (pool_ref, grossAmount, platformCommission, netAmount)
```

A pool has at most one `Delivery` (`pool_ref` is unique). Only an `ADMIN` can create/update/delete it, and only once `Pool.status` is `TARGET_REACHED`, `DISTRIBUTING`, or `COMPLETED` — not `OPEN` or `CANCELLED`. A `RETAILER` sees the delivery for pools they've joined (via `PoolParticipant`); a `SUPPLIER` sees the delivery for pools built from their own products (`Pool.productoffer_ref -> ProductOffer.product_ref -> Product.user_ref`).

`PoolParticipant.delivery_ref` (a per-participant delivery reference predating the pool-level `Delivery` above) was removed as dead code this session — a retailer's delivery is now found via `Delivery.pool_ref` matching their `PoolParticipant.pool_ref` directly.

## Entities

- **User** — `firstName/lastName/email/phoneNumber/companyName/password`, `role` (ADMIN/SUPPLIER/RETAILER), `addresses` (>=1 required), `commercialRegistration`/`vatNumber` (supplier business identity), `isVerified`, `status` (ACTIVE/SUSPENDED/PENDING), plus unused `stripeCustomerId`/`stripePaymentMehtodId` fields (Stripe is referenced in the schema but not integrated — no `stripe` package is installed).
- **Address** — `location` (map URL), `region`, `city`, `street`. Owned by a `User` via `User.addresses[]` (not the reverse).
- **Product** — owned by a supplier (`user_ref` -> User), `name/description/brand/unit` (PIECE/KG/BOX/CARTON), `images`.
- **ProductOffer** — `product_ref` -> Product, `wholeQuantity`, `price`, `status` (PENDING/NEGOTIATION/APPROVED/REJECTED, admin-controlled), `adminComment`.
- **Pool** — `productoffer_ref` -> ProductOffer, `currentQuantity`, `minimumContribution`, `pricePerUnit`, `startDate`/`endDate`, `status`, `supplierPaymentStatus` (NOT_PAID/PAID).
- **PoolParticipant** — join table: `user_ref`, `pool_ref`, `payment_ref`, `quantity`, `status` (WAITING/REFUNDED/DELIVERED).
- **Payment** — `user_ref`, `transactionReference`, `amount`, `currency` (OMR/USD), `stripePaymentIntentId` (Stripe not integrated yet), `status` (REQUIRES_CAPTURE/COMPLETED/REFUNDED).
- **Delivery** — `pool_ref` -> Pool (unique, one delivery per pool), `deliveryStatus`, `deliveredAt`. `Shipment`/`DistributionBatch` were removed from the MVP — a delivery is created directly against the pool.
- **Complaint** — `pool_ref` -> Pool, `creator_ref` -> User (the retailer or supplier who filed it), `title/description`, `priority`, `status`, `resolution`. Not tied directly to a `Delivery` — an admin walks `Pool` -> `ProductOffer`/`PoolParticipant`/`Shipment`/`Delivery` from `pool_ref` to get the details needed to act.
- **SupplierPayout** — `pool_ref`, `grossAmount/platformCommission/netAmount`, `status`, `transactionReference`, `paidAt`.
- **Notification** — `sender_ref` (nullable, may be admin/system), `recipient_ref[]` -> User, `type`, `title/message/actionUrl`, `priority`, `isRead/readAt`.
- **Auth** — `userId` -> User, `refreshToken`. One record per user, upserted on login.
- **Email** — outbound email log (`to/subject/text/html/sentAt`), auto-expires after 7 days (TTL index). Not user-facing domain data — a delivery record for `emails` service sends.

## Out of Scope / Removed

- A `meetings` service (model/controller/routes) existed at some point but has been fully deleted from the working tree (uncommitted deletion, along with its `http/meetings.http` file and its registration in `src/routes/api/v1/index.ts`). Treat "meetings" as outside current scope unless the user says otherwise — do not resurrect it without asking.
- Redis, BullMQ, and MQTT/event-broker infrastructure are mentioned in `README.md` as intended future pieces but are not present in `package.json` or `docker-compose.yml` today (an in-process `EventEmitter`-based `AppBroker` is used instead — see `docs/tech-stack.md`).
- Stripe is referenced by field names on `User` and `Payment` but no Stripe SDK is installed and no payment-provider integration exists yet.
