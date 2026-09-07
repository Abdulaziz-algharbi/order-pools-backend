import { Request, Response } from 'express';
import mongoose from 'mongoose';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import productOfferModel from '../product.offers/product.offer.model';
import userModel from '../users/user.model';
import paymentModel from '../payments/payment.model';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import thawaniGateway from '../thawani/thawani.gateway';
import Pool, { couldBeUpdated } from './pool.model';

// Participants that still hold (or once held and completed) a real claim
// on the pool's quantity — a failed/never-completed checkout or a
// withdrawn-and-refunded participant shouldn't count toward the "N joined"
// figure shown to visitors.
const COUNTED_PARTICIPANT_STATUSES = [
  'PENDING_PAYMENT',
  'WAITING',
  'DELIVERED',
];

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

  // Pool ids this retailer has ever joined (any PoolParticipant status) —
  // used to keep a pool visible to the retailer who's actually in it after
  // it moves past OPEN (TARGET_REACHED/DISTRIBUTING/COMPLETED/CANCELLED),
  // since otherwise they'd lose the ability to track or dispute an order
  // the moment it stops collecting. Mirrors ownOfferIds() for SUPPLIER.
  private async ownParticipantPoolIds(userId: string) {
    return poolParticipantModel.distinct('pool_ref', { user_ref: userId });
  }

  private async participantCounts(
    poolIds: mongoose.Types.ObjectId[]
  ): Promise<Map<string, number>> {
    const rows = await poolParticipantModel.aggregate([
      {
        $match: {
          pool_ref: { $in: poolIds },
          status: { $in: COUNTED_PARTICIPANT_STATUSES },
        },
      },
      { $group: { _id: '$pool_ref', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }

  // A pool is only ever built from an APPROVED offer — the offer's
  // display fields (name/description/image/unit) and its supplier's
  // company name are snapshotted onto the pool at creation time, since a
  // RETAILER (who needs to see them to decide whether to join) has no
  // read access to ProductOffer, which also carries the supplier's
  // wholesale price. targetQuantity is fixed to the pool's starting
  // capacity so a "collected so far" progress figure has a stable
  // denominator even as currentQuantity counts down.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const offer = await productOfferModel.findById(req.body.productoffer_ref);
      if (!offer) {
        res.status(404).send({ message: 'Product offer not found' });
        return;
      }
      if (offer.status !== 'APPROVED') {
        res.status(409).send({
          message: 'A pool can only be created from an APPROVED offer',
        });
        return;
      }

      const supplier = await userModel.findById(offer.user_ref);

      req.body.productName = offer.name;
      req.body.productDescription = offer.description;
      req.body.productImageUrl = offer.images ?? null;
      req.body.unit = offer.unit;
      req.body.supplierName = supplier?.companyName ?? null;
      req.body.targetQuantity = req.body.currentQuantity;

      await super.create(req, res);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Mirrors BaseController.list()'s opt-in ?page/?limit pagination (see
  // base.controller.ts), with participantCount attached to each doc —
  // duplicated rather than reused since the base implementation sends its
  // own response and has no post-processing hook that supports an async
  // per-batch step like the count aggregation below.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const filter = await this.buildListFilter(req, res);
      if (filter === null) return;

      const q = (req.query ?? {}) as Record<string, unknown>;
      const rawPage = Number(q.page);
      const rawLimit = Number(q.limit);
      const pagination =
        Number.isInteger(rawPage) &&
        Number.isInteger(rawLimit) &&
        rawPage >= 1 &&
        rawLimit >= 1
          ? { page: rawPage, limit: Math.min(rawLimit, 100) }
          : null;

      let query = this.model.find(filter);
      if (pagination) {
        query = query
          .skip((pagination.page - 1) * pagination.limit)
          .limit(pagination.limit);
      }

      const docs = await query;
      const counts = await this.participantCounts(docs.map((doc) => doc._id));
      const data = docs.map((doc) => ({
        ...doc.toObject(),
        participantCount: counts.get(doc._id.toString()) ?? 0,
      }));

      const total = pagination
        ? await this.model.countDocuments(filter)
        : data.length;

      this.logger.info(`${this.model.modelName} Retrieved`);
      res.status(200).send({
        message: 'Documents retrieved successfully',
        data,
        total,
        ...(pagination
          ? { page: pagination.page, limit: pagination.limit }
          : {}),
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Anonymous callers and a caller with RETAILER see OPEN (actively
  // collecting) pools; a caller with SUPPLIER also sees every pool built
  // from their own offers, regardless of status — a dual-role account
  // holding both gets the union of the two, matching access to both
  // panels. ADMIN sees every pool outright.
  protected async buildListFilter(
    req: Request,
    _res: Response
  ): Promise<Record<string, unknown> | null> {
    const user = req.meta?.user;

    if (user?.roles.includes('ADMIN')) return {};

    const conditions: Record<string, unknown>[] = [];
    if (!user || user.roles.includes('RETAILER')) {
      conditions.push({ status: 'OPEN' });
    }
    if (user?.roles.includes('RETAILER')) {
      conditions.push({
        _id: { $in: await this.ownParticipantPoolIds(user.userId) },
      });
    }
    if (user?.roles.includes('SUPPLIER')) {
      conditions.push({
        productoffer_ref: { $in: await this.ownOfferIds(user.userId) },
      });
    }
    return conditions.length > 1 ? { $or: conditions } : conditions[0];
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

        if (!visible && user?.roles.includes('RETAILER')) {
          const poolIds = await this.ownParticipantPoolIds(user.userId);
          visible = poolIds.some((id) => id.toString() === doc._id.toString());
        }

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

      const counts = await this.participantCounts([doc._id]);
      res.status(200).send({
        message: 'Document retrieved successfully',
        data: {
          ...doc.toObject(),
          participantCount: counts.get(doc._id.toString()) ?? 0,
        },
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

      // Cancelling the pool and sweeping its still-pending Payment/
      // PoolParticipant records must land together — a crash between them
      // would otherwise leave a CANCELLED pool with payments/participants
      // stuck PENDING forever, with nothing left to reconcile it. The
      // refund loop below is deliberately OUTSIDE this transaction: it
      // makes real Thawani network calls, and a DB transaction must never
      // stay open across an external HTTP round trip.
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          pool.status = 'CANCELLED';
          await pool.save({ session: dbSession });

          await paymentModel.updateMany(
            { pool_ref: pool._id, status: 'PENDING' },
            { $set: { status: 'FAILED' } },
            { session: dbSession }
          );
          await poolParticipantModel.updateMany(
            { pool_ref: pool._id, status: 'PENDING_PAYMENT' },
            { $set: { status: 'PAYMENT_FAILED' } },
            { session: dbSession }
          );
        });
      } finally {
        await dbSession.endSession();
      }

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
