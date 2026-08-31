import SupplierRequestModel from './supplier.request.model';
import supplierRequestController from './supplier.requests.controller';
import supplierRequestsRoutes from './supplier.requests.routes';

export default {
  model: SupplierRequestModel,
  controller: supplierRequestController,
  routes: supplierRequestsRoutes,
};
