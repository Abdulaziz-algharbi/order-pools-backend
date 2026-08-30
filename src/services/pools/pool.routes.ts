import { Router } from 'express';
import poolController from './pool.controller';
import { createPoolSchema, updatePoolSchema } from './pool.schema';
import {
  validate,
  tokenMiddleware,
  optionalTokenMiddleware,
  requireRole,
} from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(optionalTokenMiddleware, poolController.list.bind(poolController))
  .post(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(createPoolSchema),
    poolController.create.bind(poolController)
  );

router
  .route('/:_id')
  .get(optionalTokenMiddleware, poolController.getById.bind(poolController))
  .patch(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(updatePoolSchema),
    poolController.update.bind(poolController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    poolController.delete.bind(poolController)
  );

export default router;
