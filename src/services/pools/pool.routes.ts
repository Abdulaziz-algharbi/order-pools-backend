import { Router } from 'express';
import poolController from './pool.controller';
import { createPoolSchema, updatePoolSchema } from './pool.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(poolController.list.bind(poolController))
  .post(validate(createPoolSchema), poolController.create.bind(poolController));

router
  .route('/:_id')
  .get(poolController.getById.bind(poolController))
  .patch(validate(updatePoolSchema), poolController.update.bind(poolController))
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    poolController.delete.bind(poolController)
  );

export default router;
