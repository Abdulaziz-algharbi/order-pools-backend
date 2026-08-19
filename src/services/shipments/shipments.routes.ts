import { Router } from 'express';
import shipmentController from './shipments.conroller';

const router = Router();

router
  .route('/')
  .get(shipmentController.list.bind(shipmentController))
  .post(shipmentController.create.bind(shipmentController));

router
  .route('/:_id')
  .get(shipmentController.getById.bind(shipmentController))
  .patch(shipmentController.update.bind(shipmentController))
  .delete(shipmentController.delete.bind(shipmentController));

export default router;
