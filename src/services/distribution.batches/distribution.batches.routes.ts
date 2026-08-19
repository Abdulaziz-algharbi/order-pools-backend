import { Router } from 'express';
import distributionBatchController from './distribution.batches.contorller';

const router = Router();

router
  .route('/')
  .get(distributionBatchController.list.bind(distributionBatchController))
  .post(distributionBatchController.create.bind(distributionBatchController));

router
  .route('/:_id')
  .get(distributionBatchController.getById.bind(distributionBatchController))
  .patch(distributionBatchController.update.bind(distributionBatchController))
  .delete(distributionBatchController.delete.bind(distributionBatchController));

export default router;
