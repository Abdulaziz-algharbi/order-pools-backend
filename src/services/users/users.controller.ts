import BaseController from '../base/base.controller';
import User, { couldBeUpdated } from './user.model';

class UserController extends BaseController {
  constructor() {
    super(User, couldBeUpdated);
  }

  // You can add additional methods specific to UserController here
}

const usersController = new UserController();

export default usersController;
