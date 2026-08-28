import { Router } from 'express';

import { validate } from '../../middlewares';
import { createUserSchema, updateUserSchema } from './user.schema';
import usersController from './users.controller';

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
  .patch(
    validate(updateUserSchema),
    usersController.update.bind(usersController)
  )
  .delete(usersController.delete.bind(usersController));

export default router;
