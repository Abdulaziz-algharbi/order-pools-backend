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

const EVENTS = Object.freeze({
  DELIVERY_ASSIGNED: 'delivery:assigned',
});

export default EVENTS;
