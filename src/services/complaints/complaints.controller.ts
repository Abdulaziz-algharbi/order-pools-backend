import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import complaintModel, { couldBeUpdated } from './complaint.model';

class ComplaintController extends BaseController {
  constructor() {
    super(complaintModel, couldBeUpdated);
    this.logger.info('Complaint initialized');
  }

  // Admins see every complaint; anyone else only sees complaints they filed.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter = user.role === 'ADMIN' ? {} : { retailer_ref: user.userId };

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
}

const complaintController = new ComplaintController();

export default complaintController;
