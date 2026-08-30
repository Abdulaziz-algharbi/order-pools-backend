import { Request, Response } from 'express';
import mongoose from 'mongoose';

import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import userModel from '../users/user.model';
import AddressModel, { couldBeUpdated } from './address.model';

class AddressController extends BaseController {
  constructor() {
    super(AddressModel, couldBeUpdated);
  }

  // Address has no user_ref of its own — ownership lives on User.addresses
  // — so "own addresses" is resolved by loading the caller's User doc.
  // Anonymous callers (no token) own nothing.
  private async ownedAddressIds(userId: string): Promise<string[]> {
    const account = await userModel.findById(userId);
    return (account?.addresses ?? []).map((id) => id.toString());
  }

  // Anonymous callers may create an address (needed pre-registration: a
  // new user has no token yet but must supply address IDs to register —
  // see auth.schema.ts/auth.http), and it stays unlinked. A SUPPLIER/
  // RETAILER caller gets the new address linked onto their own account.
  // An ADMIN caller creates an address on behalf of another user, given
  // via body.user_ref (required — never inferred from the admin's own
  // id, since admins don't hold addresses themselves).
  async create(req: Request, res: Response): Promise<void> {
    try {
      const caller = req.meta?.user;
      let targetUserId: string | undefined;

      if (caller?.role === 'ADMIN') {
        const requestedUserId = req.body.user_ref as string | undefined;
        if (!requestedUserId) {
          res.status(400).send({
            message: 'user_ref is required when an admin creates an address',
          });
          return;
        }
        const targetUser = await userModel.findById(requestedUserId);
        if (!targetUser) {
          res.status(404).send({ message: 'User not found' });
          return;
        }
        targetUserId = requestedUserId;
      } else if (caller) {
        // SUPPLIER/RETAILER: always their own account, never whatever
        // user_ref the client sends.
        targetUserId = caller.userId;
      }

      delete req.body.user_ref;
      const newDoc = new this.model(req.body);
      const savedDoc = await newDoc.save();

      if (targetUserId) {
        await userModel.findByIdAndUpdate(targetUserId, {
          $addToSet: { addresses: savedDoc._id },
        });
      }

      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send(savedDoc);
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        this.logger.warn(`${this.model.modelName} Creation: Validation Error`);
        res
          .status(400)
          .send({ message: 'Validation Error', errors: error.errors });
        return;
      }

      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      ) {
        this.logger.warn(
          `${this.model.modelName} Duplicate Key: ${error.message}`
        );
        res.status(409).send({ message: error.message });
        return;
      }

      this.logger.error(`${this.model.modelName} Creation: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // ADMIN sees every address; SUPPLIER/RETAILER sees only their own.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const docs =
        user.role === 'ADMIN'
          ? await this.model.find()
          : await this.model.find({
              _id: { $in: await this.ownedAddressIds(user.userId) },
            });

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

      if (user.role !== 'ADMIN') {
        const ownedIds = await this.ownedAddressIds(user.userId);
        if (!ownedIds.includes(doc._id.toString())) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
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

  // A SUPPLIER/RETAILER may only edit their own address; ADMIN may edit
  // any address.
  async update(req: Request, res: Response): Promise<void> {
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

      if (user.role !== 'ADMIN') {
        const ownedIds = await this.ownedAddressIds(user.userId);
        if (!ownedIds.includes(doc._id.toString())) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      }

      await super.update(req, res);
    } catch (error) {
      this.logger.error(`${this.model.modelName} Update: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  // A SUPPLIER/RETAILER may only remove their own address; ADMIN may
  // remove any address. Either way, the address is pulled out of every
  // User.addresses array that references it, so deletion never leaves a
  // dangling ref behind.
  async delete(req: Request, res: Response): Promise<void> {
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

      if (user.role !== 'ADMIN') {
        const ownedIds = await this.ownedAddressIds(user.userId);
        if (!ownedIds.includes(doc._id.toString())) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      }

      await userModel.updateMany(
        { addresses: doc._id },
        { $pull: { addresses: doc._id } }
      );

      await super.delete(req, res);
    } catch (error) {
      this.logger.error(`${this.model.modelName} Delete: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }
}

const addressesController = new AddressController();

export default addressesController;
