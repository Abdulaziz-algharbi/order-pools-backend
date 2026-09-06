import { Router } from 'express';
import paymentController from './payments.controller';
import { tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

// No POST / — a Payment is only ever created as a side effect of
// PoolParticipantController.create (see pool.participants.controller.ts).
// No PATCH /:id either — every transition below is a dedicated action
// tied to an actual Thawani confirmation.
router.get(
  '/',
  tokenMiddleware,
  requireRole('ADMIN', 'RETAILER'),
  paymentController.list.bind(paymentController)
);

router.get(
  '/:_id',
  tokenMiddleware,
  requireRole('ADMIN', 'RETAILER'),
  paymentController.getById.bind(paymentController)
);

router.post(
  '/:_id/confirm',
  tokenMiddleware,
  requireRole('ADMIN', 'RETAILER'),
  paymentController.confirm.bind(paymentController)
);

router.post(
  '/:_id/cancel',
  tokenMiddleware,
  requireRole('ADMIN', 'RETAILER'),
  paymentController.cancel.bind(paymentController)
);

router.post(
  '/:_id/retry-refund',
  tokenMiddleware,
  requireRole('ADMIN'),
  paymentController.retryRefund.bind(paymentController)
);

router.post(
  '/:_id/confirm-refund',
  tokenMiddleware,
  requireRole('ADMIN'),
  paymentController.confirmRefund.bind(paymentController)
);

export default router;
