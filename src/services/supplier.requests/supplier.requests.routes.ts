import { Router } from 'express';
import supplierRequestController from './supplier.requests.controller';
import {
  createSupplierRequestSchema,
  updateSupplierRequestSchema,
} from './supplier.request.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('RETAILER', 'ADMIN'),
    supplierRequestController.list.bind(supplierRequestController)
  )
  .post(
    tokenMiddleware,
    requireRole('RETAILER'),
    validate(createSupplierRequestSchema),
    supplierRequestController.create.bind(supplierRequestController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('RETAILER', 'ADMIN'),
    supplierRequestController.getById.bind(supplierRequestController)
  )
  .patch(
    tokenMiddleware,
    requireRole('RETAILER', 'ADMIN'),
    validate(updateSupplierRequestSchema),
    supplierRequestController.update.bind(supplierRequestController)
  )
  .delete(
    tokenMiddleware,
    requireRole('RETAILER', 'ADMIN'),
    supplierRequestController.delete.bind(supplierRequestController)
  );

export default router;
