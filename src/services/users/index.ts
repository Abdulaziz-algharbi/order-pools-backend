import UserModel from './user.model';
import usersController from './users.controller';
import usersRoutes from './users.routes';

export default {
  model: UserModel,
  controller: usersController,
  routes: usersRoutes,
};
