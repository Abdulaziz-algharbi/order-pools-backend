// Business events published on AppBroker (src/app.broker.ts) — an
// EventEmitter today, but call sites only ever see .emit()/.on(), so the
// transport can be swapped for a real message broker later without
// touching any producer or consumer. Each event's payload type is
// exported alongside its name so both sides share one contract.

// Emitted by DeliveryController.create() once an admin assigns a delivery
// to a pool; consumed by NotificationController.listeners() to notify the
// supplier and every participating retailer.
export interface DeliveryAssignedEvent {
  deliveryId: string;
  poolId: string;
  // The admin who assigned it, or null if this ever fires from a fully
  // automated (non-admin-initiated) path in the future.
  assignedBy: string | null;
}

// Emitted by PaymentController.confirm() once Thawani confirms a payment
// succeeded; consumed by NotificationController.listeners() to let the
// retailer know their participation is confirmed.
export interface PaymentCompletedEvent {
  paymentId: string;
  poolParticipantId: string;
  userId: string;
}

// Emitted by PaymentController.cancel() (retailer-initiated cancel, or an
// admin clearing a stuck session) and by the pool-expiry path when a
// PENDING payment is swept up as failed.
export interface PaymentFailedEvent {
  paymentId: string;
  userId: string;
}

// Emitted once an admin confirms (via PaymentController.confirmRefund())
// that Thawani actually completed a refund.
export interface PaymentRefundedEvent {
  paymentId: string;
  userId: string;
}

// Emitted by DeliveryController.update() the moment a pool's delivery
// transitions into DELIVERED; consumed by SupplierPayoutController.listeners()
// to auto-create the payout record (amounts still computed server-side from
// the pool's COMPLETED payments — this event only triggers the creation,
// it never carries an amount).
export interface DeliveryCompletedEvent {
  deliveryId: string;
  poolId: string;
}

const EVENTS = Object.freeze({
  DELIVERY_ASSIGNED: 'delivery:assigned',
  DELIVERY_COMPLETED: 'delivery:completed',
  PAYMENT_COMPLETED: 'payment:completed',
  PAYMENT_FAILED: 'payment:failed',
  PAYMENT_REFUNDED: 'payment:refunded',
});

export default EVENTS;
