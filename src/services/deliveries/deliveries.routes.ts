import { Router } from 'express';
import deliveryController from './deliveries.controller';

const router = Router();

router
  .route('/')
  .get(deliveryController.list.bind(deliveryController))
  .post(deliveryController.create.bind(deliveryController));

router
  .route('/:_id')
  .get(deliveryController.getById.bind(deliveryController))
  .patch(deliveryController.update.bind(deliveryController))
  .delete(deliveryController.delete.bind(deliveryController));

export default router;
