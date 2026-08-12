import { Request, Response } from 'express';
import mongoose, { Model } from 'mongoose';
import bcrypt from 'bcrypt';

import config from '../../config/config';
import logger from '../../logger/logger';
import appRegistry from '../../app.registry';
import REGISTRY from '../../constants/REGISTRY';
import jwtUtil from '../../utils/jwt.util';

class BaseController {
  model: Model<any>;
  config: typeof config;
  allowedFields: Array<string>;
  logger: typeof logger;
  registry: typeof appRegistry;
  REGISTRY: typeof REGISTRY;
  jwt: typeof jwtUtil;
  hasher: typeof bcrypt;

  constructor(model: Model<any>, allowedFields: Array<string>) {
    this.model = model;
    this.config = config;
    this.allowedFields = allowedFields;
    this.logger = logger;
    this.registry = appRegistry;
    this.REGISTRY = REGISTRY;
    this.jwt = jwtUtil;
    this.hasher = bcrypt;
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const newDoc = new this.model(req.body);
      const savedDoc = await newDoc.save();
      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send(savedDoc);
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        this.logger.warn(`{this.model.modelName} Creation: Validation Error`);
        res.status(400).send({
          message: 'Validation Error',
          errors: error.errors,
        });
        return;
      }

      // MongoDB duplicate key error
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      ) {
        this.logger.warn(
          `${this.model.modelName} Duplicate Key: ${error.message}`
        );

        res.status(409).send({
          message: error.message,
        });

        return;
      }

      // Unexpected error
      this.logger.error(`${this.model.modelName} Creation: ${error}`);
      res.status(500).send({ message: 'Internal server error' });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      // add pagination, filtering, and sorting logic here if needed
      // const q = {}
      const docs = await this.model.find();
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
      this.logger.error('Retrieving specified document:', error);
      res.status(500).send({ message: 'Internal server error' });
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
      this.logger.error(`${this.model.modelName} Update: ${error}`);
      res.status(500).json({
        message: 'Internal server error',
        error,
      });
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
      this.logger.error(`${this.model.modelName} Delete: ${error}`);

      res.status(500).json({
        message: 'Internal server error',
        error,
      });
    }
  }
}

export default BaseController;
