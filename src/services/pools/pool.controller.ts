import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import productOfferModel from '../product.offers/product.offer.model';
import Pool, { couldBeUpdated } from './pool.model';

class PoolController extends BaseController {
  constructor() {
    super(Pool, couldBeUpdated);
    this.logger.info('Pool initialized');
  }

  // Offer ids built from this supplier's own offers
  // (ProductOffer.user_ref -> Pool.productoffer_ref).
  private async ownOfferIds(userId: string) {
    return productOfferModel.distinct('_id', { user_ref: userId });
  }

  // Anonymous callers and a caller with RETAILER see OPEN (actively
  // collecting) pools; a caller with SUPPLIER also sees every pool built
  // from their own offers, regardless of status — a dual-role account
  // holding both gets the union of the two, matching access to both
  // panels. ADMIN sees every pool outright.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta?.user;

      let filter: Record<string, unknown>;
      if (user?.roles.includes('ADMIN')) {
        filter = {};
      } else {
        const conditions: Record<string, unknown>[] = [];
        if (!user || user.roles.includes('RETAILER')) {
          conditions.push({ status: 'OPEN' });
        }
        if (user?.roles.includes('SUPPLIER')) {
          conditions.push({
            productoffer_ref: { $in: await this.ownOfferIds(user.userId) },
          });
        }
        filter = conditions.length > 1 ? { $or: conditions } : conditions[0];
      }

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
      const user = req.meta?.user;

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (!user?.roles.includes('ADMIN')) {
        let visible =
          doc.status === 'OPEN' && (!user || user.roles.includes('RETAILER'));

        if (!visible && user?.roles.includes('SUPPLIER')) {
          const offerIds = await this.ownOfferIds(user.userId);
          visible = offerIds.some(
            (id) => id.toString() === doc.productoffer_ref.toString()
          );
        }

        if (!visible) {
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
}

const poolController = new PoolController();

export default poolController;
