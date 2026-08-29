import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import complaintModel, { couldBeUpdated } from './complaint.model';
import ERRORS from '../../constants/ERRORS';

class ComplaintController extends BaseController {
  constructor() {
    super(complaintModel, couldBeUpdated);
    this.logger.info('Complaint initialized');
  }

  // Only the affected party (RETAILER/SUPPLIER, enforced by requireRole on
  // the route) files a complaint, always under their own authenticated user
  // id — never whatever the client sends.
  async create(req: Request, res: Response): Promise<void> {
    const user = req.meta.user;
    if (!user) {
      res.status(401).send({ message: 'Access token is missing' });
      return;
    }

    req.body.creator_ref = user.userId;

    await super.create(req, res);
  }

  // Admins see every complaint; anyone else only sees complaints they filed.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter = user.role === 'ADMIN' ? {} : { creator_ref: user.userId };

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

  // Admins can fetch any complaint; anyone else only one they filed.
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

      if (user.role !== 'ADMIN' && doc.creator_ref.toString() !== user.userId) {
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

const complaintController = new ComplaintController();

export default complaintController;
