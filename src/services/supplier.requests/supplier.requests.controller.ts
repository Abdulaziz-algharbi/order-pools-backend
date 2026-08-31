import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import userModel from '../users/user.model';
import supplierRequestModel, { couldBeUpdated } from './supplier.request.model';

// The owning RETAILER may only edit the description, and only while the
// request is still PENDING; ADMIN may only set the review fields.
const OWNER_UPDATABLE_FIELDS = ['description'];
const ADMIN_UPDATABLE_FIELDS = couldBeUpdated;

class SupplierRequestController extends BaseController {
  constructor() {
    super(supplierRequestModel, couldBeUpdated);
    this.logger.info('SupplierRequestController initialized');
  }

  // Only a RETAILER who isn't already a SUPPLIER may file a request
  // (enforced by requireRole('RETAILER') on the route, plus the
  // already-a-supplier check here), always under their own authenticated
  // user id — never whatever the client sends.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      if (user.roles.includes('SUPPLIER')) {
        res.status(409).send({
          message: 'This account is already a SUPPLIER',
        });
        return;
      }

      const existing = await this.model.findOne({
        user_ref: user.userId,
        status: 'PENDING',
      });
      if (existing) {
        res.status(409).send({ message: ERRORS.CONFLICT });
        return;
      }

      const doc = new this.model({
        user_ref: user.userId,
        description: req.body.description,
      });
      const saved = await doc.save();

      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send({
        message: 'Document created successfully',
        data: saved,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // ADMIN sees every request; a RETAILER only sees their own.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter = user.roles.includes('ADMIN')
        ? {}
        : { user_ref: user.userId };

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

  // ADMIN may fetch any request; a RETAILER only one of their own.
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

  // The owning RETAILER may only edit description, and only while the
  // request is still PENDING (once reviewed, the outcome is final). ADMIN
  // may patch status/adminComment on any request, whether or not they own
  // it — approving is the only place the underlying role change happens:
  // it adds SUPPLIER onto the requester's existing roles (never replacing
  // RETAILER), giving that account both panels. Written directly (rather
  // than delegating to BaseController.update, which only knows one static
  // allowed-fields list) since the allowed set depends on which caller is
  // making the request.
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

      const isOwner = doc.user_ref.toString() === user.userId;
      const isAdmin = user.roles.includes('ADMIN');

      let allowedFields: string[];
      if (isAdmin) {
        allowedFields = ADMIN_UPDATABLE_FIELDS;
      } else if (isOwner) {
        if (doc.status !== 'PENDING') {
          res.status(409).send({
            message: 'Only a PENDING request can be edited',
          });
          return;
        }
        allowedFields = OWNER_UPDATABLE_FIELDS;
      } else {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      if (isAdmin && doc.status !== 'PENDING' && 'status' in req.body) {
        res.status(409).send({
          message: 'Only a PENDING request can be reviewed',
        });
        return;
      }

      for (const field of Object.keys(req.body)) {
        if (allowedFields.includes(field)) {
          doc[field] = req.body[field];
        }
      }

      if (isAdmin && doc.status === 'APPROVED') {
        await userModel.findByIdAndUpdate(doc.user_ref, {
          $addToSet: { roles: 'SUPPLIER' },
        });
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

  // The owning RETAILER may delete their own request; ADMIN may delete any.
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

const supplierRequestController = new SupplierRequestController();

export default supplierRequestController;
