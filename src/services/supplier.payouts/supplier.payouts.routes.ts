import { Router } from 'express';
import supplierPayoutController from './supplier.payouts.controller';

const router = Router();

router
  .route('/')
  .get(supplierPayoutController.list.bind(supplierPayoutController))
  .post(supplierPayoutController.create.bind(supplierPayoutController));

router
  .route('/:_id')
  .get(supplierPayoutController.getById.bind(supplierPayoutController))
  .patch(supplierPayoutController.update.bind(supplierPayoutController))
  .delete(supplierPayoutController.delete.bind(supplierPayoutController));

export default router;
