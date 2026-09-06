import { Router } from 'express';
import supplierPayoutController from './supplier.payouts.controller';
import {
  createSupplierPayoutSchema,
  updateSupplierPayoutSchema,
} from './supplier.payout.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

// No DELETE route — a payout is a financial record, never hard-deleted.
router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'SUPPLIER'),
    supplierPayoutController.list.bind(supplierPayoutController)
  )
  .post(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(createSupplierPayoutSchema),
    supplierPayoutController.create.bind(supplierPayoutController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'SUPPLIER'),
    supplierPayoutController.getById.bind(supplierPayoutController)
  );

router.patch(
  '/:_id',
  tokenMiddleware,
  requireRole('ADMIN'),
  validate(updateSupplierPayoutSchema),
  supplierPayoutController.update.bind(supplierPayoutController)
);

export default router;
