import ProductOfferModel from './product.offer.model';
import productOffersController from './product.offers.controller';
import productOffersRoutes from './product.offers.routes';

export default {
  model: ProductOfferModel,
  controller: productOffersController,
  routes: productOffersRoutes,
};
