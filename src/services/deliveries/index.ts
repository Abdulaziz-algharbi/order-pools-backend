import deliveryController from './deliveries.controller';
import deliveryRoutes from './deliveries.routes';
import deliveryModel from './delivery.model';

export default {
  model: deliveryModel,
  controller: deliveryController,
  routes: deliveryRoutes,
};
