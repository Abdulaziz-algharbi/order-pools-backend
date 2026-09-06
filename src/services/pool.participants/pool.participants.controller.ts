import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import config from '../../config/config';
import poolModel from '../pools/pool.model';
import userModel from '../users/user.model';
import productOfferModel from '../product.offers/product.offer.model';
import paymentModel from '../payments/payment.model';
import thawaniGateway from '../thawani/thawani.gateway';
import poolParticipantModel, { couldBeUpdated } from './pool.participant.model';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

class PoolParticipantController extends BaseController {
  constructor() {
    super(poolParticipantModel, couldBeUpdated);
    this.logger.info('PoolParticipant initialized');
  }

  // Releases a quantity reservation back onto a still-OPEN pool (see
  // create()'s atomic claim) — used both by the rollback path here and by
  // delete() when a participant withdraws before the pool concludes.
  // remainingWasZero indicates the reservation had flipped the pool to
  // TARGET_REACHED, which must be reverted back to OPEN along with it.
  private async releaseReservation(
    poolId: string,
    quantity: number,
    remainingWasZero: boolean
  ) {
    await poolModel.updateOne(
      { _id: poolId },
      remainingWasZero
        ? { $inc: { currentQuantity: quantity }, $set: { status: 'OPEN' } }
        : { $inc: { currentQuantity: quantity } }
    );
  }

  // A participant is always the authenticated caller (RETAILER, enforced
  // by requireRole on the route) — never whatever user_ref the client
  // sends. The chosen address must be one of that user's own addresses,
  // which is a cross-document check a Mongoose/Zod validator can't
  // express, so it lives here rather than in the schema.
  //
  // Joining now means: reserve the quantity (as before), then create a
  // Payment + Thawani checkout session for the retailer's contribution —
  // the participant starts PENDING_PAYMENT and is only usable once
  // PaymentController.confirm() sees Thawani report the session paid.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const caller = req.meta.user;
      if (!caller) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      req.body.user_ref = caller.userId;
      const { user_ref, address_ref, pool_ref, quantity } = req.body;

      const user = await userModel.findById(user_ref);
      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      const ownsAddress = user.addresses.some(
        (id) => id.toString() === address_ref
      );
      if (!ownsAddress) {
        res.status(400).send({
          message: "address_ref must be one of the user's own addresses",
        });
        return;
      }

      const pool = await poolModel.findById(pool_ref);
      if (!pool) {
        res.status(404).send({ message: 'Pool not found' });
        return;
      }

      if (pool.status !== 'OPEN') {
        res.status(409).send({
          message: 'Pool is not open for participation',
        });
        return;
      }

      // Pool.currentQuantity is the quantity still available to be claimed
      // (it starts at the offer's whole quantity and counts down as
      // participants join, hitting 0 once the pool is full). A join must
      // claim at least minimumContribution, can never claim more than what
      // is left, and can never leave a "remainder" behind that is smaller
      // than minimumContribution (since no future participant could ever
      // claim it) — unless it takes the remaining quantity in full, leaving
      // exactly 0. Re-validated with a fresh read so the client can get a
      // precise reason before the atomic, concurrency-safe check below.
      if (quantity < pool.minimumContribution) {
        res.status(400).send({
          message: `quantity must be at least the pool's minimum contribution (${pool.minimumContribution})`,
        });
        return;
      }

      if (quantity > pool.currentQuantity) {
        res.status(400).send({
          message: `quantity cannot exceed the pool's remaining quantity (${pool.currentQuantity})`,
        });
        return;
      }

      const remainingAfter = pool.currentQuantity - quantity;
      if (remainingAfter !== 0 && remainingAfter < pool.minimumContribution) {
        res.status(400).send({
          message: `quantity would leave ${remainingAfter} remaining, which is less than the minimum contribution (${pool.minimumContribution}) — take between ${pool.minimumContribution} and ${pool.currentQuantity - pool.minimumContribution}, or take all ${pool.currentQuantity}`,
        });
        return;
      }

      // Re-checked atomically against the pool's live state (not the
      // `pool` read above, which can already be stale under concurrent
      // joins) so two simultaneous requests can never both succeed past
      // the bound and overshoot/undershoot Pool.currentQuantity. Uses an
      // update pipeline (rather than a plain $inc) so hitting exactly 0
      // flips status to TARGET_REACHED in the same atomic operation.
      const claimedPool = await poolModel.findOneAndUpdate(
        {
          _id: pool_ref,
          status: 'OPEN',
          $expr: {
            $and: [
              { $gte: [quantity, '$minimumContribution'] },
              { $lte: [quantity, '$currentQuantity'] },
              {
                $or: [
                  { $eq: [{ $subtract: ['$currentQuantity', quantity] }, 0] },
                  {
                    $gte: [
                      { $subtract: ['$currentQuantity', quantity] },
                      '$minimumContribution',
                    ],
                  },
                ],
              },
            ],
          },
        },
        [
          {
            $set: {
              currentQuantity: { $subtract: ['$currentQuantity', quantity] },
              status: {
                $cond: [
                  { $eq: [{ $subtract: ['$currentQuantity', quantity] }, 0] },
                  'TARGET_REACHED',
                  '$status',
                ],
              },
            },
          },
        ]
      );

      if (!claimedPool) {
        res.status(409).send({
          message:
            'Pool quantity changed before this request completed — please retry',
        });
        return;
      }

      const remainingWasZero = remainingAfter === 0;
      let paymentId: string | undefined;

      try {
        // The retailer's contribution, computed server-side — never
        // trusted from the client.
        const amount = quantity * pool.pricePerUnit;

        // `new Model()` assigns `_id` locally without hitting the DB, so
        // it's available as Thawani's client_reference_id before the
        // payment doc (which needs the session id it returns) is saved.
        const payment = new paymentModel({
          pool_ref,
          user_ref,
          amount,
          thawaniSessionId: 'pending',
        });
        paymentId = payment._id.toString();

        const offer = await productOfferModel.findById(pool.productoffer_ref);

        const session = await thawaniGateway.createCheckoutSession({
          clientReferenceId: paymentId,
          products: [
            {
              name: offer?.name ?? 'OrderPools contribution',
              quantity,
              unit_amount: Math.round(pool.pricePerUnit * 1000),
            },
          ],
          successUrl: `${config.frontendUrl}/payments/${paymentId}/result?outcome=success`,
          cancelUrl: `${config.frontendUrl}/payments/${paymentId}/result?outcome=cancelled`,
        });

        payment.thawaniSessionId = session.session_id;
        await payment.save();

        const participant = new this.model({
          ...req.body,
          payment_ref: payment._id,
        });
        const savedParticipant = await participant.save();

        this.logger.info(`${this.model.modelName} created`);
        res.status(201).send({
          message: 'Document created successfully',
          data: savedParticipant,
          payment: {
            _id: payment._id,
            amount: payment.amount,
            status: payment.status,
          },
          checkoutUrl: thawaniGateway.checkoutUrl(session.session_id),
        });
      } catch (innerError) {
        // Nothing downstream of the reservation succeeded (or the
        // participant itself failed to save) — release it, and don't
        // leave an orphaned Payment doc behind with no participant to
        // point at.
        await this.releaseReservation(pool_ref, quantity, remainingWasZero);
        if (paymentId) {
          await paymentModel.deleteOne({ _id: paymentId });
        }
        throw innerError;
      }
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Admin sees every participant (optionally narrowed to one pool via
  // ?pool_ref=... to see everyone in a given pool); anyone else only sees
  // their own participations.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const filter: Record<string, unknown> = user.roles.includes('ADMIN')
        ? {}
        : { user_ref: user.userId };

      if (req.query.pool_ref) {
        filter.pool_ref = req.query.pool_ref;
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

  // A retailer may only remove their own participant. Allowed while the
  // pool is still OPEN (backing out before it commits — releases the
  // quantity reservation, and either voids a not-yet-paid Payment or
  // refunds an already-COMPLETED one), once the pool is COMPLETED (fully
  // delivered), or once it's been CANCELLED for at least 7 days (a grace
  // period, e.g. for refund/dispute handling, measured from Pool.updatedAt
  // — the pool has no dedicated cancelledAt field). Any other pool status
  // (TARGET_REACHED / DISTRIBUTING, or a CANCELLED pool still inside the
  // 7-day window) blocks deletion.
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const participant = await this.model.findById(req.params._id);
      if (!participant) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      if (participant.user_ref.toString() !== user.userId) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      const pool = await poolModel.findById(participant.pool_ref);
      if (!pool) {
        res.status(404).send({ message: 'Pool not found' });
        return;
      }

      const cancelledLongEnoughAgo =
        pool.status === 'CANCELLED' &&
        Date.now() - new Date(pool.updatedAt).getTime() >= SEVEN_DAYS_MS;

      const canDelete =
        pool.status === 'OPEN' ||
        pool.status === 'COMPLETED' ||
        cancelledLongEnoughAgo;

      if (!canDelete) {
        res.status(409).send({
          message:
            'Participation can only be removed while the pool is open, once it is completed, or 7 days after it was cancelled',
        });
        return;
      }

      // Withdrawing from a still-collecting pool frees the quantity this
      // participant was holding, and settles whatever became of their
      // Payment — the Payment record itself is never deleted, only ever
      // transitioned, so it stays as a permanent record either way.
      if (pool.status === 'OPEN') {
        await this.releaseReservation(
          pool._id.toString(),
          participant.quantity,
          false
        );

        const payment = await paymentModel.findById(participant.payment_ref);
        if (payment?.status === 'PENDING') {
          payment.status = 'FAILED';
          await payment.save();
        } else if (payment?.status === 'COMPLETED') {
          try {
            const refund = await thawaniGateway.createRefund({
              paymentId: payment.thawaniPaymentId ?? payment._id.toString(),
              reason: 'Retailer withdrew from the pool',
            });
            payment.status = 'REFUND_PENDING';
            payment.thawaniRefundId = refund.refund_id ?? null;
          } catch (refundError) {
            this.logger.error(
              `Refund request failed for payment ${payment._id} on withdrawal: ${refundError}`
            );
            payment.status = 'REFUND_FAILED';
          }
          await payment.save();
        }
      }

      await super.delete(req, res);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}
const poolParticipantController = new PoolParticipantController();

export default poolParticipantController;
