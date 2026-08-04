import BaseController from '../base/base.controller';
import ProductOffer, { couldBeUpdated } from './productOffer.model';

class ProductOffertController extends BaseController {
  constructor() {
    super(ProductOffer, couldBeUpdated);
  }

  // You can add additional methods specific to ProductController here
}

const productOffersController = new ProductOffertController();

export default productOffersController;
