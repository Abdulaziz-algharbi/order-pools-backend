import { Router } from 'express';
import distributionBatchController from './distribution.batches.contorller';
import {
  createDistributionBatchSchema,
  updateDistributionBatchSchema,
} from './distribution.batch.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(distributionBatchController.list.bind(distributionBatchController))
  .post(
    validate(createDistributionBatchSchema),
    distributionBatchController.create.bind(distributionBatchController)
  );

router
  .route('/:_id')
  .get(distributionBatchController.getById.bind(distributionBatchController))
  .patch(
    validate(updateDistributionBatchSchema),
    distributionBatchController.update.bind(distributionBatchController)
  )
  .delete(distributionBatchController.delete.bind(distributionBatchController));

export default router;
