import { Request, Response } from 'express';
import logger from '../../logger/logger';
import paymentController from '../payments/payments.controller';

// Thawani calls this when a checkout session's status changes (configured
// as a callback URL in the Thawani merchant dashboard — see
// thawani.gateway.ts for what is and isn't confirmed about this
// mechanism). The payload is never trusted directly: there's no confirmed
// signature/verification scheme for it, so it's only ever used to figure
// out which Payment to re-verify via PaymentController.confirmPaymentById,
// which makes its own authenticated server-to-server call to Thawani. A
// forged webhook call can at most trigger a redundant, harmless status
// check — it can never move a Payment forward on its own.
//
// Always responds 200 immediately so Thawani doesn't retry-storm us, even
// if reconciliation itself fails — the failure is logged, and the
// retailer's own success_url landing (POST /payments/:id/confirm) or an
// admin can trigger the same recheck later.
async function handleThawaniWebhook(req: Request, res: Response) {
  res.status(200).send({ received: true });

  const clientReferenceId: unknown =
    req.body?.data?.client_reference_id ?? req.body?.client_reference_id;

  if (typeof clientReferenceId !== 'string' || !clientReferenceId) {
    logger.warn(
      'Thawani webhook received with no client_reference_id, ignoring'
    );
    return;
  }

  try {
    await paymentController.confirmPaymentById(clientReferenceId);
  } catch (error) {
    logger.error(
      `Thawani webhook reconciliation failed for payment ${clientReferenceId}: ${error}`
    );
  }
}

export default { handleThawaniWebhook };
