import { Request, Response } from 'express';
import mongoose, { Model } from 'mongoose';
import bcrypt from 'bcrypt';

import config from '../../config/config';
import logger from '../../logger/logger';
import appRegistry from '../../app.registry';
import REGISTRY from '../../constants/REGISTRY';
import jwtUtil from '../../utils/jwt.util';
import appBroker from '../../app.broker';
import ERRORS from '../../constants/ERRORS';

class BaseController {
  model: Model<any>;
  config: typeof config;
  allowedFields: Array<string>;
  logger: typeof logger;
  registry: typeof appRegistry;
  REGISTRY: typeof REGISTRY;
  jwt: typeof jwtUtil;
  hasher: typeof bcrypt;
  broker: typeof appBroker;
  listeners?(): void;
  ERRORS: typeof ERRORS;
  errorHandler: (
    err: any,
    req: Request,
    res: Response
    // next: Function
  ) => void;

  constructor(model: Model<any>, allowedFields?: Array<string>) {
    this.model = model;
    this.config = config;
    this.allowedFields = allowedFields || [];
    this.logger = logger;
    this.registry = appRegistry;
    this.REGISTRY = REGISTRY;
    this.jwt = jwtUtil;
    this.hasher = bcrypt;
    this.broker = appBroker;
    this.ERRORS = ERRORS;

    this.errorHandler = (
      err: any,
      req: Request,
      res: Response
      // next: Function
    ) => {
      this.logger.error(`Error: ${err.message}`);

      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).send({
          message: 'Validation Error',
          errors: err.errors,
        });
        return;
      }

      // A malformed id (e.g. an :_id route param that isn't a valid
      // ObjectId) throws this before any not-found check ever runs — worth
      // its own 400 rather than falling through to a generic 500.
      if (err instanceof mongoose.Error.CastError) {
        res.status(400).send({
          message: `Invalid ${err.path}: '${err.value}' is not a valid id`,
        });
        return;
      }

      if (
        err instanceof mongoose.mongo.MongoServerError &&
        err.code === 11000
      ) {
        res.status(409).send({ message: err.message });
        return;
      }

      switch (err.message) {
        case ERRORS.USER_NOT_FOUND:
          res.status(404).send({ message: ERRORS.USER_NOT_FOUND });
          break;
        case ERRORS.INVALID_CREDENTIALS:
          res.status(401).send({ message: ERRORS.INVALID_CREDENTIALS });
          break;
        case ERRORS.UNAUTHORIZED:
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          break;
        case ERRORS.CONFLICT:
          res.status(409).send({ message: ERRORS.CONFLICT });
          break;
        case ERRORS.INTERNAL_SERVER_ERROR:
          res.status(500).send({ message: ERRORS.INTERNAL_SERVER_ERROR });
          break;
        case ERRORS.TOKEN_EXPIRED:
          res.status(401).send({ message: ERRORS.TOKEN_EXPIRED });
          break;
        default:
          res.status(500).send({ message: ERRORS.INTERNAL_SERVER_ERROR });
      }
    };

    if (this.listeners && typeof this.listeners === 'function') {
      this.listeners();
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const newDoc = new this.model(req.body);
      const savedDoc = await newDoc.save();
      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send(savedDoc);
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // The one place a subclass customizes list() visibility — return the
  // Mongoose filter for the caller (e.g. role-scoped to their own
  // documents), or `null` after sending a response yourself (e.g. a 401
  // for an unauthenticated caller) to short-circuit list() entirely.
  // Defaults to "everyone sees everything", matching a subclass that
  // never needed scoping in the first place.
  protected async buildListFilter(
    _req: Request,
    _res: Response
  ): Promise<Record<string, unknown> | null> {
    return {};
  }

  // A Mongoose projection string (e.g. '-password'), applied to every
  // list() query. Rarely needed — most services don't have a field worth
  // excluding from a list response.
  protected listSelect(): string | null {
    return null;
  }

  // Per-document post-processing applied after the query resolves (e.g.
  // redacting a Notification's `recipients[]` down to the caller's own
  // entry). Defaults to a no-op.
  protected transformListDoc(doc: unknown, _req: Request): unknown {
    return doc;
  }

  // Pagination is opt-in via ?page & ?limit (both required and must be
  // positive integers, capped at 100 per page) — a caller that omits them
  // gets today's behavior unchanged: every matching document, in one
  // response, with `total` equal to how many came back. This keeps every
  // existing caller (and every list() override that never anticipated
  // pagination) working exactly as before.
  private parseListPagination(
    req: Request
  ): { page: number; limit: number } | null {
    // req.query is always an object on a real Express request, but many
    // existing unit tests construct a bare `{}` request that skips it —
    // guard rather than throw on those.
    const q = (req.query ?? {}) as Record<string, unknown>;
    const page = Number(q.page);
    const limit = Number(q.limit);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1
    ) {
      return null;
    }
    return { page, limit: Math.min(limit, 100) };
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const filter = await this.buildListFilter(req, res);
      if (filter === null) return; // buildListFilter already responded

      const pagination = this.parseListPagination(req);

      let query = this.model.find(filter);
      const select = this.listSelect();
      if (select) query = query.select(select);
      if (pagination) {
        query = query
          .skip((pagination.page - 1) * pagination.limit)
          .limit(pagination.limit);
      }

      const docs = await query;
      const data = docs.map((doc: unknown) => this.transformListDoc(doc, req));

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

  async getById(req: Request, res: Response): Promise<void> {
    try {
      // if(req.ref) {

      // }

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        this.logger.error(
          `${this.model.modelName} Specific Retrieving: Doc Not Found`
        );
        res.status(404).send({
          message: 'Document not Found',
          data: null,
        });
        return;
      }
      this.logger.info(`${this.model.modelName} ID: Retrieved`);
      res.status(200).send({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);

      if (!doc) {
        this.logger.error(`${this.model.modelName} Update: Doc Not Found`);
        res.status(404).send({
          message: 'Document not Found',
          data: null,
        });
        return;
      }
      const data = req.body;
      for (const field of Object.keys(data)) {
        if (this.allowedFields.includes(field)) {
          doc[field] = data[field];
        }
      }
      await doc.save();
      this.logger.info(`${this.model.modelName} Updated`);

      res.status(200).send({
        message: 'Document updated successfully',
        data: doc,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);

      if (!doc) {
        this.logger.error(`${this.model.modelName} Delete: Doc Not Found`);
        res.status(404).json({
          message: 'Document not Found',
          data: null,
        });
        return;
      }
      await this.model.deleteOne({ _id: doc._id });
      this.logger.info(`${this.model.modelName} Deleted`);
      res.status(204).json({
        message: 'Document deleted successfully',
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

export default BaseController;
