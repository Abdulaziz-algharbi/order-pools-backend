import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import deliveryModel, { couldBeUpdated } from './delivery.model';
import poolModel from '../pools/pool.model';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import productModel from '../products/product.model';
import productOfferModel from '../product.offers/product.offer.model';
import ERRORS from '../../constants/ERRORS';
import type { UserRole } from '../users/user.model';

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

      await super.create(req, res);
    } catch (error) {
      this.logger.error(`Delivery Creation: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // Admin sees every delivery. A retailer sees deliveries for pools they
  // joined; a supplier sees deliveries for pools built from their own
  // products (Pool -> ProductOffer -> Product.user_ref).
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter =
        user.role === 'ADMIN'
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
      this.logger.error(
        `Retrieving ${this.model.modelName} documents: ${error}`
      );
      res.status(500).send({ message: 'Internal server error' });
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

      if (user.role !== 'ADMIN') {
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
      this.logger.error(`Retrieving specified document: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // Pool ids a non-admin caller is allowed to see a delivery for.
  private async visiblePoolIds(user: { userId: string; role: UserRole }) {
    if (user.role === 'SUPPLIER') {
      const productIds = await productModel.distinct('_id', {
        user_ref: user.userId,
      });
      const offerIds = await productOfferModel.distinct('_id', {
        product_ref: { $in: productIds },
      });
      return poolModel.distinct('_id', {
        productoffer_ref: { $in: offerIds },
      });
    }

    // RETAILER: pools they've joined as a participant.
    return poolParticipantModel.distinct('pool_ref', {
      user_ref: user.userId,
    });
  }
}

const deliveryController = new DeliveryController();

export default deliveryController;
