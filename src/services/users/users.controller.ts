import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import User, { couldBeUpdated } from './user.model';
import logger from '../../logger/logger';

// This entire module is ADMIN only (see users.routes.ts) — retailers and
// suppliers register, log in, refresh, and read their own info through
// /auth instead (see auth.controller.ts). Role changes normally happen by
// approving a supplier request (see supplier.requests.controller.ts), but
// an admin may also correct `roles` directly here via `couldBeUpdated`.
class UserController extends BaseController {
  constructor() {
    super(User, couldBeUpdated);
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const docs = await this.model.find().select('-password');
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

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.params._id)
        .select('-password')
        .populate('addresses');
      if (!user) {
        logger.error(`UserID Retrieving Error: User Not Found`);
        res.status(404).send({
          message: 'User Not Found',
        });
        return;
      }
      res.status(200).send({
        message: 'User Retrieved',
        data: user,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}
const usersController = new UserController();

export default usersController;
