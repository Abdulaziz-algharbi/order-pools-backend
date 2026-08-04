import BaseController from '../base/base.controller';
import Product, { couldBeUpdated } from './product.model';

class ProductController extends BaseController {
  constructor() {
    super(Product, couldBeUpdated);
  }

  // You can add additional methods specific to ProductController here
}

const productsController = new ProductController();

export default productsController;
