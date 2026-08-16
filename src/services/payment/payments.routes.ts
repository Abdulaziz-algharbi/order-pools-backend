import { Router } from 'express';
import paymentController from './payments.controller';

const router = Router();

router
  .route('/')
  .get(paymentController.list.bind(paymentController))
  .post(paymentController.create.bind(paymentController));

router
  .route('/:_id')
  .get(paymentController.getById.bind(paymentController))
  .patch(paymentController.update.bind(paymentController))
  .delete(paymentController.delete.bind(paymentController));

export default router;
