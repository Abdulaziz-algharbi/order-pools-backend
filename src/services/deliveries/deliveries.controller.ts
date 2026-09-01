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
