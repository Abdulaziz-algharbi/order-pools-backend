import { Router } from 'express';
import paymentController from './payments.controller';
import { createPaymentSchema, updatePaymentSchema } from './payment.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(paymentController.list.bind(paymentController))
  .post(
    validate(createPaymentSchema),
    paymentController.create.bind(paymentController)
  );

router
  .route('/:_id')
  .get(paymentController.getById.bind(paymentController))
  .patch(
    validate(updatePaymentSchema),
    paymentController.update.bind(paymentController)
  )
  .delete(paymentController.delete.bind(paymentController));

export default router;
