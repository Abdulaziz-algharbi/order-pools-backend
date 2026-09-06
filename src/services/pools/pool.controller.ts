import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import productOfferModel from '../product.offers/product.offer.model';
import paymentModel from '../payments/payment.model';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import thawaniGateway from '../thawani/thawani.gateway';
import Pool, { couldBeUpdated } from './pool.model';

class PoolController extends BaseController {
  constructor() {
    super(Pool, couldBeUpdated);
    this.logger.info('Pool initialized');
  }

  // Offer ids built from this supplier's own offers
  // (ProductOffer.user_ref -> Pool.productoffer_ref).
  private async ownOfferIds(userId: string) {
    return productOfferModel.distinct('_id', { user_ref: userId });
  }

  // Anonymous callers and a caller with RETAILER see OPEN (actively
  // collecting) pools; a caller with SUPPLIER also sees every pool built
  // from their own offers, regardless of status — a dual-role account
  // holding both gets the union of the two, matching access to both
  // panels. ADMIN sees every pool outright.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta?.user;

      let filter: Record<string, unknown>;
      if (user?.roles.includes('ADMIN')) {
        filter = {};
      } else {
        const conditions: Record<string, unknown>[] = [];
        if (!user || user.roles.includes('RETAILER')) {
          conditions.push({ status: 'OPEN' });
        }
        if (user?.roles.includes('SUPPLIER')) {
          conditions.push({
            productoffer_ref: { $in: await this.ownOfferIds(user.userId) },
          });
        }
        filter = conditions.length > 1 ? { $or: conditions } : conditions[0];
      }

      const docs = await this.model.find(filter);
      this.logger.info(`${this.model.modelName} Retrieved`);
      res.status(200).send({
        message: 'Documents retrieved successfully',
        data: docs,
        total: docs.length,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Same visibility rule as list(), applied to a single document.
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta?.user;

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (!user?.roles.includes('ADMIN')) {
        let visible =
          doc.status === 'OPEN' && (!user || user.roles.includes('RETAILER'));

        if (!visible && user?.roles.includes('SUPPLIER')) {
          const offerIds = await this.ownOfferIds(user.userId);
          visible = offerIds.some(
            (id) => id.toString() === doc.productoffer_ref.toString()
          );
        }

        if (!visible) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
  // POST /pools/:id/expire — ADMIN only (enforced by requireRole on the
  // route too). A pool that never reached its target past its endDate is
  // an admin-triggered transition, not an automatic one — there's no
  // scheduler/cron in this codebase to drive it off endDate on its own
  // (see the payments-workflow design discussion). Sets the pool
  // CANCELLED and requests a full refund of every COMPLETED payment tied
  // to it; any still-PENDING payment (an abandoned checkout, never
  // confirmed or cancelled) is simply marked FAILED — nothing was ever
  // collected for it, so there's nothing to refund. Refund failures don't
  // block the others — each is handled independently so an admin can see
  // exactly which ones need a manual retry (POST /payments/:id/retry-refund).
  async expirePool(req: Request, res: Response): Promise<void> {
    try {
      const pool = await this.model.findById(req.params._id);
      if (!pool) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (pool.status !== 'OPEN') {
        res.status(409).send({
          message: 'Only an OPEN pool can be expired',
        });
        return;
      }

      if (new Date(pool.endDate).getTime() > Date.now()) {
        res.status(409).send({
          message: 'Pool has not reached its endDate yet',
        });
        return;
      }

      pool.status = 'CANCELLED';
      await pool.save();

      await paymentModel.updateMany(
        { pool_ref: pool._id, status: 'PENDING' },
        { $set: { status: 'FAILED' } }
      );
      await poolParticipantModel.updateMany(
        { pool_ref: pool._id, status: 'PENDING_PAYMENT' },
        { $set: { status: 'PAYMENT_FAILED' } }
      );

      const completedPayments = await paymentModel.find({
        pool_ref: pool._id,
        status: 'COMPLETED',
      });

      let refundsRequested = 0;
      let refundsFailed = 0;

      for (const payment of completedPayments) {
        try {
          const refund = await thawaniGateway.createRefund({
            paymentId: payment.thawaniPaymentId ?? payment._id.toString(),
            reason: 'Pool did not reach its target',
          });
          payment.status = 'REFUND_PENDING';
          payment.thawaniRefundId = refund.refund_id ?? null;
          await payment.save();
          refundsRequested += 1;
        } catch (refundError) {
          this.logger.error(
            `Refund request failed for payment ${payment._id} on pool expiry: ${refundError}`
          );
          payment.status = 'REFUND_FAILED';
          await payment.save();
          refundsFailed += 1;
        }
      }

      this.logger.info(
        `Pool ${pool._id} expired: ${refundsRequested} refund(s) requested, ${refundsFailed} failed`
      );

      res.status(200).send({
        message: 'Pool expired and refunds requested',
        data: pool,
        refundsRequested,
        refundsFailed,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const poolController = new PoolController();

export default poolController;
