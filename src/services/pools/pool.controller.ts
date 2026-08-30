import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import productModel from '../products/product.model';
import productOfferModel from '../product.offers/product.offer.model';
import Pool, { couldBeUpdated } from './pool.model';

class PoolController extends BaseController {
  constructor() {
    super(Pool, couldBeUpdated);
    this.logger.info('Pool initialized');
  }

  // Offer ids built from this supplier's own products
  // (Product.user_ref -> ProductOffer.product_ref -> Pool.productoffer_ref).
  private async ownOfferIds(userId: string) {
    const productIds = await productModel.distinct('_id', {
      user_ref: userId,
    });
    return productOfferModel.distinct('_id', {
      product_ref: { $in: productIds },
    });
  }

  // Anonymous callers and RETAILER see only OPEN (actively collecting)
  // pools. SUPPLIER sees only pools built from their own products,
  // regardless of status. ADMIN sees every pool.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta?.user;

      let filter: Record<string, unknown> = { status: 'OPEN' };
      if (user?.role === 'ADMIN') {
        filter = {};
      } else if (user?.role === 'SUPPLIER') {
        filter = {
          productoffer_ref: { $in: await this.ownOfferIds(user.userId) },
        };
      }

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
      const user = req.meta?.user;

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (user?.role === 'SUPPLIER') {
        const offerIds = await this.ownOfferIds(user.userId);
        const owns = offerIds.some(
          (id) => id.toString() === doc.productoffer_ref.toString()
        );
        if (!owns) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      } else if (user?.role !== 'ADMIN' && doc.status !== 'OPEN') {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
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
}

const poolController = new PoolController();

export default poolController;
