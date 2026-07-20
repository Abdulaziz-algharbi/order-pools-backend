import { Request, Response } from 'express';
import { Model } from 'mongoose';

import config from '../../config/config';

class BaseController {
  model: Model<any>;
  config: typeof config;

  constructor(model: Model<any>) {
    this.model = model;
    this.config = config;
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

  // async getById(req: Request, res: Response): Promise<void> {
  //   try {
  //   } catch (error) {}
  // }

  // async update(req: Request, res: Response): Promise<void> {
  //   try {
  //   } catch (error) {}
  // }

  // async delete(req: Request, res: Response): Promise<void> {
  //   try {
  //   } catch (error) {}
  // }
}

export default BaseController;
