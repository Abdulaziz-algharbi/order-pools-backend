import addressesController from './addresses.controller';
import AddressModel from './address.model';
import addressesRoutes from './addresses.routes';

export default {
  model: AddressModel,
  controller: addressesController,
  routes: addressesRoutes,
};
