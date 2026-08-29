import { Router } from 'express';
import deliveryController from './deliveries.controller';
import { createDeliverySchema, updateDeliverySchema } from './delivery.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(tokenMiddleware, deliveryController.list.bind(deliveryController))
  .post(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(createDeliverySchema),
    deliveryController.create.bind(deliveryController)
  );

router
  .route('/:_id')
  .get(tokenMiddleware, deliveryController.getById.bind(deliveryController))
  .patch(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(updateDeliverySchema),
    deliveryController.update.bind(deliveryController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    deliveryController.delete.bind(deliveryController)
  );

export default router;
