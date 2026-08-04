import { Request, Response } from 'express';
import { Model } from 'mongoose';

import config from '../../config/config';

class BaseController {
  model: Model<any>;
  config: typeof config;
  allowedFields: Array<string>;

  constructor(model: Model<any>, allowedFields: Array<string>) {
    this.model = model;
    this.config = config;
    this.allowedFields = allowedFields;
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const newDoc = new this.model(req.body);
      const savedDoc = await newDoc.save();
      res.status(201).json(savedDoc);
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      // add pagination, filtering, and sorting logic here if needed
      // const q = {}
      const docs = await this.model.find();
      res.status(200).json({
        message: 'Documents retrieved successfully',
        data: docs,
        total: docs.length,
      });
    } catch (error) {
      console.error('Error retrieving documents:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).json({
          message: 'Document not Found',
          data: null,
        });
        return;
      }
      res.status(200).json({
        message: 'Document retrieved successfully',
        data: doc,
      });
    } catch (error) {
      console.error('Error retrieving specified document:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const doc = await this.model.findById(req.params._id);

      if (!doc) {
        res.status(404).json({
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

      res.status(200).json({
        message: 'Document updated successfully',
        data: doc,
      });
    } catch (error) {
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
        res.status(404).json({
          message: 'Document not Found',
          data: null,
        });
        return;
      }
      await this.model.deleteOne({ _id: doc._id });
      res.status(204).json({
        message: 'Document deleted successfully',
      });
    } catch (error) {
      res.status(500).json({
        message: 'Internal server error',
        error,
      });
    }
  }
}

export default BaseController;
