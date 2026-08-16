import { Router } from 'express';
import poolController from './pool.controller';

const router = Router();

router
  .route('/')
  .get(poolController.list.bind(poolController))
  .post(poolController.create.bind(poolController));

router
  .route('/:_id')
  .get(poolController.getById.bind(poolController))
  .patch(poolController.update.bind(poolController))
  .delete(poolController.delete.bind(poolController));

export default router;
