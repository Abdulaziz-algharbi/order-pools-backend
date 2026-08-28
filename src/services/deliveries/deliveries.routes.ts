import { Router } from 'express';
import deliveryController from './deliveries.controller';
import { createDeliverySchema, updateDeliverySchema } from './delivery.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(deliveryController.list.bind(deliveryController))
  .post(
    validate(createDeliverySchema),
    deliveryController.create.bind(deliveryController)
  );

router
  .route('/:_id')
  .get(deliveryController.getById.bind(deliveryController))
  .patch(
    validate(updateDeliverySchema),
    deliveryController.update.bind(deliveryController)
  )
  .delete(deliveryController.delete.bind(deliveryController));

export default router;
