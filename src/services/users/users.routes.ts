import { Router } from 'express';

import usersController from './users.controller';
import { createUserSchema } from './user.schema';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

router
  .route('/')
  .get(usersController.list.bind(usersController))
  .post(
    validate(createUserSchema),
    usersController.create.bind(usersController)
  );

router
  .route('/:_id')
  .get(usersController.getById.bind(usersController))
  .patch(usersController.update.bind(usersController))
  .delete(usersController.delete.bind(usersController));

export default router;
