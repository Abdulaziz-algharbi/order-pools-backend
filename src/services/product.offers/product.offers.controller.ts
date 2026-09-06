import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ProductOffer, { couldBeUpdated } from './product.offer.model';
import ERRORS from '../../constants/ERRORS';

// A SUPPLIER (the offer's owner) may touch the product details and
// commercial terms; ADMIN may only touch the review fields — never the
// other way around.
const OWNER_UPDATABLE_FIELDS = [
  'name',
  'description',
  'brand',
  'unit',
  'images',
  'wholeQuantity',
  'price',
];
const ADMIN_UPDATABLE_FIELDS = ['status', 'adminComment'];

class ProductOfferController extends BaseController {
  constructor() {
    super(ProductOffer, couldBeUpdated);
    this.logger.info('ProductOfferController initialized');
  }

  // Only a SUPPLIER creates an offer (enforced by requireRole on the
  // route), always under their own authenticated user id — never whatever
  // the client sends.
  async create(req: Request, res: Response): Promise<void> {
    const user = req.meta.user;
    if (!user) {
      res.status(401).send({ message: 'Access token is missing' });
      return;
    }

    req.body.user_ref = user.userId;

    await super.create(req, res);
  }

  // ADMIN sees every offer; a SUPPLIER only sees their own.
  protected async buildListFilter(
    req: Request,
    res: Response
  ): Promise<Record<string, unknown> | null> {
    const user = req.meta.user;
    if (!user) {
      res.status(401).send({ message: 'Access token is missing' });
      return null;
    }

    return user.roles.includes('ADMIN') ? {} : { user_ref: user.userId };
  }

  // ADMIN may fetch any offer; a SUPPLIER only one of their own.
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

      if (
        !user.roles.includes('ADMIN') &&
        doc.user_ref.toString() !== user.userId
      ) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // The owning SUPPLIER may patch the product details (name/description/
  // brand/unit/images) and commercial terms (wholeQuantity/price). ADMIN
  // may only patch status/adminComment, on any offer whether or not they
  // own it. Written directly (rather than delegating to BaseController.update,
  // which only knows one static allowed-fields list) since the allowed set
  // here depends on which caller is making the request.
  async update(req: Request, res: Response): Promise<void> {
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

      let allowedFields: string[];
      if (user.roles.includes('ADMIN')) {
        allowedFields = ADMIN_UPDATABLE_FIELDS;
      } else if (doc.user_ref.toString() === user.userId) {
        allowedFields = OWNER_UPDATABLE_FIELDS;
      } else {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      for (const field of Object.keys(req.body)) {
        if (allowedFields.includes(field)) {
          doc[field] = req.body[field];
        }
      }

      // Keep rejectedAt (the TTL clock, see product.offer.model.ts) in
      // sync whenever ADMIN moves status in or out of REJECTED.
      if (allowedFields === ADMIN_UPDATABLE_FIELDS && 'status' in req.body) {
        doc.rejectedAt = doc.status === 'REJECTED' ? new Date() : null;
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

  // ADMIN may delete any offer; a SUPPLIER may delete only their own.
  // (A REJECTED offer also auto-deletes 7 days after rejection via the TTL
  // index on rejectedAt — see product.offer.model.ts.)
  async delete(req: Request, res: Response): Promise<void> {
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

      if (
        !user.roles.includes('ADMIN') &&
        doc.user_ref.toString() !== user.userId
      ) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      await super.delete(req, res);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const productOffersController = new ProductOfferController();

export default productOffersController;
