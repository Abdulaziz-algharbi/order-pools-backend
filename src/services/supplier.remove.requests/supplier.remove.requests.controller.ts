import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import userModel from '../users/user.model';
import authModel from '../auth/auth.model';
import supplierRemoveRequestModel, {
  couldBeUpdated,
} from './supplier.remove.request.model';

// Requests are created only by AuthController.remove (see auth.controller.ts)
// when a SUPPLIER calls /auth/remove — there is no public POST route here.
// This service only covers viewing and ADMIN review of those requests.
class SupplierRemoveRequestController extends BaseController {
  constructor() {
    super(supplierRemoveRequestModel, couldBeUpdated);
    this.logger.info('SupplierRemoveRequestController initialized');
  }

  // ADMIN sees every request; anyone else only sees their own.
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

  // ADMIN may fetch any request; anyone else only one of their own.
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

  // ADMIN only (enforced by requireRole on the route too). Approving is
  // what actually removes the requesting user's account and revokes their
  // session — the whole reason this request flow exists instead of letting
  // a SUPPLIER delete themselves outright via /auth/remove.
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

      if (doc.status !== 'PENDING' && 'status' in req.body) {
        res.status(409).send({
          message: 'Only a PENDING request can be reviewed',
        });
        return;
      }

      for (const field of Object.keys(req.body)) {
        if (couldBeUpdated.includes(field)) {
          doc[field] = req.body[field];
        }
      }

      if (doc.status === 'APPROVED') {
        await userModel.deleteOne({ _id: doc.user_ref });
        await authModel.deleteOne({ userId: doc.user_ref });
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

  // The owner may withdraw their own request while it's still PENDING;
  // ADMIN may delete any request.
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

      const isOwner = doc.user_ref.toString() === user.userId;
      const isAdmin = user.roles.includes('ADMIN');

      if (!isAdmin && !isOwner) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      if (!isAdmin && doc.status !== 'PENDING') {
        res.status(409).send({
          message: 'Only a PENDING request can be withdrawn',
        });
        return;
      }

      await super.delete(req, res);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const supplierRemoveRequestController = new SupplierRemoveRequestController();

export default supplierRemoveRequestController;
