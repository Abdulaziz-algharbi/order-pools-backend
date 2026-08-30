import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import poolModel from '../pools/pool.model';
import userModel from '../users/user.model';
import poolParticipantModel, { couldBeUpdated } from './pool.participant.model';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

class PoolParticipantController extends BaseController {
  constructor() {
    super(poolParticipantModel, couldBeUpdated);
    this.logger.info('PoolParticipant initialized');
  }

  // A participant is always the authenticated caller (RETAILER, enforced
  // by requireRole on the route) — never whatever user_ref the client
  // sends. The chosen address must be one of that user's own addresses,
  // which is a cross-document check a Mongoose/Zod validator can't
  // express, so it lives here rather than in the schema.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const caller = req.meta.user;
      if (!caller) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      req.body.user_ref = caller.userId;
      const { user_ref, address_ref } = req.body;

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

      await super.create(req, res);
    } catch (error) {
      this.logger.error(`PoolParticipant Creation: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
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

      const filter: Record<string, unknown> =
        user.role === 'ADMIN' ? {} : { user_ref: user.userId };

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
      this.logger.error(
        `Retrieving ${this.model.modelName} documents: ${error}`
      );
      res.status(500).send({ message: 'Internal server error' });
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

      if (user.role !== 'ADMIN' && doc.user_ref.toString() !== user.userId) {
        res.status(403).send({ message: ERRORS.UNAUTHORIZED });
        return;
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.logger.error(`Retrieving specified document: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // A retailer may only edit their own participant, and only while the
  // pool is still OPEN (collecting contributions) — once it moves past
  // that (target reached / distributing / completed / cancelled), the
  // participation is locked.
  async update(req: Request, res: Response): Promise<void> {
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

      if (pool.status !== 'OPEN') {
        res.status(409).send({
          message:
            'Participation can only be updated while the pool is still open',
        });
        return;
      }

      await super.update(req, res);
    } catch (error) {
      this.logger.error(`PoolParticipant Update: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // A retailer may only remove their own participant. Allowed while the
  // pool is still OPEN (backing out before it commits), once the pool is
  // COMPLETED (fully delivered), or once it's been CANCELLED for at least
  // 7 days (a grace period, e.g. for refund/dispute handling, measured
  // from Pool.updatedAt — the pool has no dedicated cancelledAt field).
  // Any other pool status (TARGET_REACHED / DISTRIBUTING, or a CANCELLED
  // pool still inside the 7-day window) blocks deletion.
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

      await super.delete(req, res);
    } catch (error) {
      this.logger.error(`PoolParticipant Delete: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }
}
const poolParticipantController = new PoolParticipantController();

export default poolParticipantController;
