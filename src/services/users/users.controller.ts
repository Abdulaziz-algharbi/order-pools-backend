import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import User, { couldBeUpdated } from './user.model';
import logger from '../../logger/logger';

class UserController extends BaseController {
  constructor() {
    super(User, couldBeUpdated);
  }

  // You can add additional methods specific to UserController here
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.params._id).populate('addresses');
      if (!user) {
        logger.error(`UserID Retrieving Error: User Not Found`);
        res.status(404).send({
          message: 'User Not Found',
        });
      }
      res.status(200).send({
        message: 'User Retrieved',
        data: user,
      });
    } catch (err) {
      logger.error(`UserID Retrieving Error: ${err}`);
      res.status(500).send({
        message: 'Server Internal Error',
      });
    }
  }
}
const usersController = new UserController();

export default usersController;
