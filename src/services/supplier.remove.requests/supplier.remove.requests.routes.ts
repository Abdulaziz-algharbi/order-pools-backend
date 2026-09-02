import { Router } from 'express';
import supplierRemoveRequestController from './supplier.remove.requests.controller';
import { updateSupplierRemoveRequestSchema } from './supplier.remove.request.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

// No POST route — a request is only ever created as a side effect of
// AuthController.remove (see auth.controller.ts) when a SUPPLIER calls
// /auth/remove, never posted directly by a client.
router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'SUPPLIER', 'RETAILER'),
    supplierRemoveRequestController.list.bind(supplierRemoveRequestController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'SUPPLIER', 'RETAILER'),
    supplierRemoveRequestController.getById.bind(
      supplierRemoveRequestController
    )
  )
  .patch(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(updateSupplierRemoveRequestSchema),
    supplierRemoveRequestController.update.bind(supplierRemoveRequestController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN', 'SUPPLIER', 'RETAILER'),
    supplierRemoveRequestController.delete.bind(supplierRemoveRequestController)
  );

export default router;
