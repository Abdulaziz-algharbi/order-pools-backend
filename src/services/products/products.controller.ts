import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import Product, { couldBeUpdated } from './product.model';
import logger from '../../logger/logger';

class ProductController extends BaseController {
  constructor() {
    super(Product, couldBeUpdated);
  }

  // You can add additional methods specific to ProductController here
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const product = await Product.findById(req.params._id).populate(
        'user_ref'
      );
      if (!product) {
        logger.error(`ProductID Retrieving Error: User Not Found`);
        res.status(404).send({
          message: 'Product Not Found',
        });
      }
      res.status(200).send({
        message: 'Product Retrieved',
        data: product,
      });
    } catch (err) {
      logger.error(`ProductID Retrieving Error: ${err}`);

      res.status(500).send({
        message: 'Server Internal Error',
      });
    }
  }
}

const productsController = new ProductController();

export default productsController;
