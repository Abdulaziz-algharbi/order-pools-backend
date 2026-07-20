import BaseController from '../base/base.controller';
import User from './user.model';

class UserController extends BaseController {
  constructor() {
    super(User);
  }

  // You can add additional methods specific to UserController here
}

const usersController = new UserController();

export default usersController;
