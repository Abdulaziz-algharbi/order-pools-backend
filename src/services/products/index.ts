import ProductModel from './product.model';
import productsController from './products.controller';
import productsRoutes from './products.routes';

export default {
  model: ProductModel,
  controller: productsController,
  routes: productsRoutes,
};
