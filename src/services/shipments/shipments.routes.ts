import { Router } from 'express';
import shipmentController from './shipments.conroller';
import { createShipmentSchema, updateShipmentSchema } from './shipment.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(shipmentController.list.bind(shipmentController))
  .post(
    validate(createShipmentSchema),
    shipmentController.create.bind(shipmentController)
  );

router
  .route('/:_id')
  .get(shipmentController.getById.bind(shipmentController))
  .patch(
    validate(updateShipmentSchema),
    shipmentController.update.bind(shipmentController)
  )
  .delete(shipmentController.delete.bind(shipmentController));

export default router;
