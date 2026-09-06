import { Request, Response } from 'express';
import mongoose from 'mongoose';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import EVENTS from '../../constants/EVENTS';
import poolModel from '../pools/pool.model';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import thawaniGateway, { isSessionPaid } from '../thawani/thawani.gateway';
import paymentModel, { couldBeUpdated } from './payment.model';

// No create/update schema or routes — a Payment is only ever created as a
// side effect of PoolParticipantController.create, and every subsequent
// transition below goes through a dedicated action tied to an actual
// Thawani confirmation, never a generic PATCH (couldBeUpdated is empty).
class PaymentController extends BaseController {
  constructor() {
    super(paymentModel, couldBeUpdated);
    this.logger.info('Payment initialized');
  }

  // ADMIN sees every payment; anyone else only their own.
  protected async buildListFilter(
    req: Request,
    res: Response
  ): Promise<Record<string, unknown> | null> {
    const user = req.meta.user;
    if (!user) {
      res.status(401).send({ message: 'Access token is missing' });
      return null;
    }

    return user.roles.includes('ADMIN') ? {} : { user_ref: user.userId };
  }

  // Same visibility rule as list(), applied to a single document.
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (
        !user.roles.includes('ADMIN') &&
        doc.user_ref.toString() !== user.userId
      ) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // The one place PENDING -> COMPLETED actually happens. Shared by the
  // retailer-facing confirm() action below (called when the frontend lands
  // on success_url) and the Thawani webhook — both only ever trigger a
  // fresh, authenticated GET against Thawani here; neither a redirect nor
  // a webhook payload is ever trusted on its own (see thawani.gateway.ts).
  // Idempotent: safe to call repeatedly, and safe under a race between the
  // webhook and the retailer's own confirm call.
  async confirmPaymentById(paymentId: string) {
    const payment = await paymentModel.findById(paymentId);
    if (!payment || payment.status !== 'PENDING') {
      // Not found, or already resolved (COMPLETED/FAILED/etc) — nothing to do.
      return payment;
    }

    const session = await thawaniGateway.getSession(payment.thawaniSessionId);
    if (!isSessionPaid(session)) {
      // Not a confirmed failure either (see isSessionPaid) — leave PENDING.
      return payment;
    }

    // Everything from here on is pure DB writes (the Thawani call already
    // happened above) — safe to wrap in a transaction so the Payment
    // flipping COMPLETED and its PoolParticipant flipping WAITING can
    // never land only one of the two.
    const dbSession = await mongoose.startSession();
    let confirmed: any = null;
    try {
      await dbSession.withTransaction(async () => {
        const updated = await paymentModel.findOneAndUpdate(
          { _id: payment._id, status: 'PENDING' },
          {
            $set: {
              status: 'COMPLETED',
              thawaniPaymentId:
                (session.invoice as string) ?? session.session_id,
            },
          },
          { new: true, session: dbSession }
        );
        if (!updated) return; // Lost a race with a concurrent confirm.

        await poolParticipantModel.updateOne(
          { _id: updated.poolParticipant_ref, status: 'PENDING_PAYMENT' },
          { $set: { status: 'WAITING' } },
          { session: dbSession }
        );
        confirmed = updated;
      });
    } finally {
      await dbSession.endSession();
    }

    if (!confirmed) {
      // Lost a race with a concurrent confirm — whichever call won already
      // did the work above.
      return payment;
    }

    this.broker.emit(EVENTS.PAYMENT_COMPLETED, {
      paymentId: confirmed._id.toString(),
      poolParticipantId: confirmed.poolParticipant_ref.toString(),
      userId: confirmed.user_ref.toString(),
    });

    return confirmed;
  }

  // POST /payments/:id/confirm — owner or ADMIN. What the frontend calls
  // on landing at success_url; also what the Thawani webhook delegates to.
  async confirm(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const existing = await paymentModel.findById(req.params._id);
      if (!existing) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (
        !user.roles.includes('ADMIN') &&
        existing.user_ref.toString() !== user.userId
      ) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      const payment = await this.confirmPaymentById(req.params._id as string);
      res.status(200).send({
        message: 'Payment status checked',
        data: payment,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // POST /payments/:id/cancel — owner or ADMIN. Only valid from PENDING.
  // Thawani's session status is never treated as a definite failure (see
  // thawani.gateway.ts) — failure is always this explicit action: the
  // retailer landing on cancel_url, or an admin clearing a session nobody
  // ever returned to. Releases the pool's quantity reservation (only if
  // the pool is still OPEN — once it's moved on, currentQuantity no longer
  // means "still collecting" and is left alone).
  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const existing = await paymentModel.findById(req.params._id);
      if (!existing) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (
        !user.roles.includes('ADMIN') &&
        existing.user_ref.toString() !== user.userId
      ) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      const updated = await paymentModel.findOneAndUpdate(
        { _id: existing._id, status: 'PENDING' },
        { $set: { status: 'FAILED' } },
        { new: true }
      );
      if (!updated) {
        res.status(409).send({
          message: 'Only a PENDING payment can be cancelled',
        });
        return;
      }

      const participant = await poolParticipantModel.findOneAndUpdate(
        { _id: updated.poolParticipant_ref, status: 'PENDING_PAYMENT' },
        { $set: { status: 'PAYMENT_FAILED' } }
      );

      if (participant) {
        const pool = await poolModel.findById(updated.pool_ref);
        if (pool?.status === 'OPEN') {
          await poolModel.updateOne(
            { _id: updated.pool_ref },
            { $inc: { currentQuantity: participant.quantity } }
          );
        }
      }

      this.broker.emit(EVENTS.PAYMENT_FAILED, {
        paymentId: updated._id.toString(),
        userId: updated.user_ref.toString(),
      });

      res.status(200).send({ message: 'Payment cancelled', data: updated });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // POST /payments/:id/retry-refund — ADMIN only (enforced by requireRole
  // on the route too), from REFUND_FAILED — re-attempts the Thawani
  // refund request after a prior one errored out.
  async retryRefund(req: Request, res: Response): Promise<void> {
    try {
      const payment = await paymentModel.findById(req.params._id);
      if (!payment) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (payment.status !== 'REFUND_FAILED') {
        res.status(409).send({
          message: 'Only a REFUND_FAILED payment can be retried',
        });
        return;
      }

      try {
        const refund = await thawaniGateway.createRefund({
          paymentId: payment.thawaniPaymentId ?? payment._id.toString(),
          reason: 'Retry after a previous refund attempt failed',
        });
        payment.status = 'REFUND_PENDING';
        payment.thawaniRefundId = refund.refund_id ?? payment.thawaniRefundId;
        await payment.save();

        res.status(200).send({ message: 'Refund re-requested', data: payment });
      } catch (gatewayError) {
        this.logger.error(
          `Refund retry failed for payment ${payment._id}: ${gatewayError}`
        );
        res.status(502).send({
          message: 'The payment provider rejected the refund retry',
        });
      }
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // POST /payments/:id/confirm-refund — ADMIN only. A deliberately manual
  // confirmation, not an automatic poll — Thawani's refund-status response
  // schema isn't confirmed from documentation (see thawani.gateway.ts), so
  // an admin checks the Thawani merchant dashboard and confirms here
  // rather than this code guessing at an unconfirmed status string.
  async confirmRefund(req: Request, res: Response): Promise<void> {
    try {
      const payment = await paymentModel.findById(req.params._id);
      if (!payment) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (payment.status !== 'REFUND_PENDING') {
        res.status(409).send({
          message: 'Only a REFUND_PENDING payment can be confirmed refunded',
        });
        return;
      }

      // The Payment flipping REFUNDED and its PoolParticipant flipping
      // REFUNDED must land together, not just one of the two.
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          payment.status = 'REFUNDED';
          await payment.save({ session: dbSession });

          await poolParticipantModel.updateOne(
            { _id: payment.poolParticipant_ref },
            { $set: { status: 'REFUNDED' } },
            { session: dbSession }
          );
        });
      } finally {
        await dbSession.endSession();
      }

      this.broker.emit(EVENTS.PAYMENT_REFUNDED, {
        paymentId: payment._id.toString(),
        userId: payment.user_ref.toString(),
      });

      res
        .status(200)
        .send({ message: 'Payment marked refunded', data: payment });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const paymentController = new PaymentController();

export default paymentController;
