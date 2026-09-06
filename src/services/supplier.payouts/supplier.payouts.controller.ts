import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import EVENTS, { DeliveryCompletedEvent } from '../../constants/EVENTS';
import poolModel from '../pools/pool.model';
import productOfferModel from '../product.offers/product.offer.model';
import deliveryModel from '../deliveries/delivery.model';
import SupplierPayoutModel, { couldBeUpdated } from './supplier.payout.model';

class SupplierPayoutController extends BaseController {
  constructor() {
    super(SupplierPayoutModel, couldBeUpdated);
    this.logger.info('SupplierPayout initialized');
  }

  // Pool ids built from this supplier's own offers, for visibility scoping
  // below — mirrors DeliveryController's own visiblePoolIds helper.
  private async ownPoolIds(userId: string) {
    const offerIds = await productOfferModel.distinct('_id', {
      user_ref: userId,
    });
    return poolModel.distinct('_id', {
      productoffer_ref: { $in: offerIds },
    });
  }

  // Shared by the admin-facing create() below and by the DeliveryCompleted
  // auto-create path in listeners() — the supplier is owed exactly the
  // agreed ProductOffer.price; the platform's margin is fixed by the admin
  // up front (baked into Pool.pricePerUnit vs. that price when the pool is
  // created), so there is nothing to compute from actual retailer payments
  // here. Caller is responsible for checking a payout doesn't already
  // exist for the pool. Returns null if the pool or its product offer
  // can't be found.
  private async computePayout(poolId: string) {
    const pool = await poolModel.findById(poolId);
    if (!pool) return null;

    const offer = await productOfferModel.findById(pool.productoffer_ref);
    if (!offer) return null;

    const doc = new this.model({ pool_ref: poolId, amount: offer.price });
    return doc.save();
  }

  // Emitted by DeliveryController.update() the moment a delivery
  // transitions into DELIVERED — auto-creates the payout so an admin no
  // longer has to remember to POST one manually. Thawani still has no
  // vendor/marketplace payout capability (verified against its full API
  // surface — see thawani.gateway.ts), so this only creates the
  // PENDING record with its amounts computed; actually paying the
  // supplier stays a manual transfer an admin executes and then records
  // via update() (status/transactionReference/paidAt).
  listeners(): void {
    this.broker.on(
      EVENTS.DELIVERY_COMPLETED,
      async (event: DeliveryCompletedEvent) => {
        try {
          await this.handleDeliveryCompleted(event);
        } catch (error) {
          // EventEmitter does not await listeners — never let a failure
          // here propagate back into whatever raised the event (the
          // delivery itself already succeeded and must not be affected).
          this.logger.error(
            `${EVENTS.DELIVERY_COMPLETED} auto-payout failed for pool ${event.poolId}: ${error}`
          );
        }
      }
    );
  }

  private async handleDeliveryCompleted(event: DeliveryCompletedEvent) {
    const existing = await this.model.findOne({ pool_ref: event.poolId });
    if (existing) return;

    const created = await this.computePayout(event.poolId);
    if (!created) {
      this.logger.warn(
        `Could not auto-create payout for pool ${event.poolId} after delivery — pool or product offer not found`
      );
      return;
    }

    this.logger.info(
      `${this.model.modelName} auto-created for pool ${event.poolId}`
    );
  }

  // ADMIN only (enforced by requireRole on the route too). Only creatable
  // once the pool's Delivery has reached DELIVERED — requiring delivery to
  // be confirmed first protects the platform if fulfillment fails after
  // the pool succeeds. In practice DeliveryController.update() already
  // auto-creates this via listeners() above the moment DELIVERED is set,
  // so this endpoint mainly exists as a manual fallback (e.g. the pool's
  // product offer couldn't be found at that moment).
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { pool_ref } = req.body;

      const pool = await poolModel.findById(pool_ref);
      if (!pool) {
        res.status(404).send({ message: 'Pool not found' });
        return;
      }

      const delivery = await deliveryModel.findOne({ pool_ref });
      if (!delivery || delivery.deliveryStatus !== 'DELIVERED') {
        res.status(409).send({
          message:
            "A payout can only be created once the pool's delivery is DELIVERED",
        });
        return;
      }

      const existing = await this.model.findOne({ pool_ref });
      if (existing) {
        res
          .status(409)
          .send({ message: 'A payout already exists for this pool' });
        return;
      }

      const saved = await this.computePayout(pool_ref);
      if (!saved) {
        res.status(404).send({
          message: 'Product offer for this pool could not be found',
        });
        return;
      }

      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send(saved);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // ADMIN sees every payout; a SUPPLIER sees only payouts for pools built
  // from their own offers.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter = user.roles.includes('ADMIN')
        ? {}
        : { pool_ref: { $in: await this.ownPoolIds(user.userId) } };

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
        const ownIds = await this.ownPoolIds(user.userId);
        const isVisible = ownIds.some(
          (id) => id.toString() === doc.pool_ref.toString()
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

  // ADMIN only. amount is fixed at creation (see create()) — only the
  // execution-tracking fields (status/transactionReference/paidAt) are
  // patchable. paidAt is auto-stamped on a transition to COMPLETED unless
  // explicitly supplied, mirroring ProductOfferController's rejectedAt.
  async update(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      for (const field of Object.keys(req.body)) {
        if (this.allowedFields.includes(field)) {
          doc[field] = req.body[field];
        }
      }

      if (req.body.status === 'COMPLETED' && !req.body.paidAt) {
        doc.paidAt = new Date();
      }

      await doc.save();

      this.logger.info(`${this.model.modelName} Updated`);
      res.status(200).send({
        message: 'Document updated successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const supplierPayoutController = new SupplierPayoutController();

export default supplierPayoutController;
