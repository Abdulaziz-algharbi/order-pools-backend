import { Request, Response } from 'express';
import ERRORS from '../../constants/ERRORS';
import EVENTS from '../../constants/EVENTS';
import BaseController from '../base/base.controller';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import poolModel from '../pools/pool.model';
import productOfferModel from '../product.offers/product.offer.model';
import type { UserRole } from '../users/user.model';
import deliveryModel, { couldBeUpdated } from './delivery.model';

// A pool can only receive a delivery once it has actually reached its
// target — not while it's still OPEN (collecting contributions) or CANCELLED.
const POOL_NOT_READY_STATUSES = ['OPEN', 'CANCELLED'];

class DeliveryController extends BaseController {
  constructor() {
    super(deliveryModel, couldBeUpdated);
    this.logger.info('Delivery initialized');
  }

  // Only an admin creates a delivery (enforced by requireRole on the route),
  // and only once its pool has reached target. A pool gets at most one
  // delivery — enforced here and by the model's unique index on pool_ref.
  // Written directly (rather than delegating to BaseController.create)
  // since the saved doc's id is needed to raise the DeliveryAssigned
  // business event — see notifications.controller.ts, which is the only
  // place that event turns into actual notifications.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const pool = await poolModel.findById(req.body.pool_ref);
      if (!pool) {
        res.status(404).send({ message: 'Pool not found' });
        return;
      }

      if (POOL_NOT_READY_STATUSES.includes(pool.status)) {
        res.status(409).send({
          message:
            'Pool must reach its target before a delivery can be created',
        });
        return;
      }

      const existing = await this.model.findOne({ pool_ref: pool._id });
      if (existing) {
        res
          .status(409)
          .send({ message: 'A delivery already exists for this pool' });
        return;
      }

      const newDoc = new this.model(req.body);
      const savedDoc = await newDoc.save();
      this.logger.info(`${this.model.modelName} created`);

      // Best-effort: a delivery being assigned is what "distribution has
      // started" means for the pool. Guarded on TARGET_REACHED so this
      // never clobbers a pool a future flow already moved on from; a
      // failure here is logged but must never undo the delivery itself.
      try {
        await poolModel.updateOne(
          { _id: pool._id, status: 'TARGET_REACHED' },
          { $set: { status: 'DISTRIBUTING' } }
        );
      } catch (syncError) {
        this.logger.error(
          `Failed to move pool ${pool._id} to DISTRIBUTING after delivery ${savedDoc._id} was created: ${syncError}`
        );
      }

      this.broker.emit(EVENTS.DELIVERY_ASSIGNED, {
        deliveryId: savedDoc._id.toString(),
        poolId: pool._id.toString(),
        assignedBy: req.meta.user?.userId ?? null,
      });

      res.status(201).send(savedDoc);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // ADMIN only (enforced by requireRole on the route). Written directly
  // (rather than delegating to BaseController.update) so a transition into
  // DELIVERED can raise the DeliveryCompleted business event — see
  // SupplierPayoutController.listeners(), which is the only place that
  // event turns into an auto-created payout. Gated on the *transition*
  // (not just the resulting status) so re-saving an already-DELIVERED
  // delivery never re-fires it.
  async update(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      const wasDelivered = doc.deliveryStatus === 'DELIVERED';

      const data = req.body;
      for (const field of Object.keys(data)) {
        if (this.allowedFields.includes(field)) {
          doc[field] = data[field];
        }
      }
      await doc.save();
      this.logger.info(`${this.model.modelName} Updated`);

      if (!wasDelivered && doc.deliveryStatus === 'DELIVERED') {
        // Best-effort: a completed delivery is what "this pool is done"
        // means, both for the pool itself and for every participant still
        // WAITING on it (a REFUNDED/PAYMENT_FAILED participant never had
        // anything delivered, so it's excluded). Failure here is logged,
        // never allowed to block the DELIVERY_COMPLETED event below —
        // that event driving the supplier's payout matters more than this
        // read-model bookkeeping.
        try {
          await poolModel.updateOne(
            { _id: doc.pool_ref },
            { $set: { status: 'COMPLETED' } }
          );
          await poolParticipantModel.updateMany(
            { pool_ref: doc.pool_ref, status: 'WAITING' },
            { $set: { status: 'DELIVERED' } }
          );
        } catch (syncError) {
          this.logger.error(
            `Failed to sync pool/participant status after delivery ${doc._id} completed: ${syncError}`
          );
        }

        this.broker.emit(EVENTS.DELIVERY_COMPLETED, {
          deliveryId: doc._id.toString(),
          poolId: doc.pool_ref.toString(),
        });
      }

      res.status(200).send({
        message: 'Document updated successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Admin sees every delivery. A retailer sees deliveries for pools they
  // joined; a supplier sees deliveries for pools built from their own
  // offers (Pool -> ProductOffer.user_ref).
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter = user.roles.includes('ADMIN')
        ? {}
        : { pool_ref: { $in: await this.visiblePoolIds(user) } };

      const docs = await this.model.find(filter);
      this.logger.info(`${this.model.modelName} Retrieved`);
      res.status(200).send({
        message: 'Documents retrieved successfully',
        data: docs,
        total: docs.length,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Same visibility rule as list(), applied to a single document.
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (!user.roles.includes('ADMIN')) {
        const visiblePoolIds = await this.visiblePoolIds(user);
        const isVisible = visiblePoolIds.some(
          (poolId) => poolId.toString() === doc.pool_ref.toString()
        );
        if (!isVisible) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Pool ids a non-admin caller is allowed to see a delivery for — the
  // union of both roles when a caller holds both (SUPPLIER: pools built
  // from their own offers; RETAILER: pools they've joined as a participant).
  private async visiblePoolIds(user: { userId: string; roles: UserRole[] }) {
    const poolIdLists = await Promise.all([
      user.roles.includes('SUPPLIER')
        ? productOfferModel
            .distinct('_id', { user_ref: user.userId })
            .then((offerIds) =>
              poolModel.distinct('_id', {
                productoffer_ref: { $in: offerIds },
              })
            )
        : Promise.resolve([]),
      user.roles.includes('RETAILER')
        ? poolParticipantModel.distinct('pool_ref', { user_ref: user.userId })
        : Promise.resolve([]),
    ]);

    return poolIdLists.flat();
  }
}

const deliveryController = new DeliveryController();

export default deliveryController;
