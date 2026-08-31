import { Router } from 'express';

import { validate, tokenMiddleware, requireRole } from '../../middlewares';
import { createUserSchema, updateUserSchema } from './user.schema';
import usersController from './users.controller';

const router = Router();

// ADMIN only, end to end. Retailers/suppliers never touch this module —
// they register, log in, refresh, and read their own info via /auth
// instead (see auth.routes.ts).
router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('ADMIN'),
    usersController.list.bind(usersController)
  )
  .post(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(createUserSchema),
    usersController.create.bind(usersController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('ADMIN'),
    usersController.getById.bind(usersController)
  )
  .patch(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(updateUserSchema),
    usersController.update.bind(usersController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    usersController.delete.bind(usersController)
  );

export default router;
