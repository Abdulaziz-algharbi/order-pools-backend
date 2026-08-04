import ProductOfferModel from './productOffer.model';
import productOffersController from './productOffers.controller';
import productOffersRoutes from './productOffers.routes';

export default {
  model: ProductOfferModel,
  controller: productOffersController,
  routes: productOffersRoutes,
};
