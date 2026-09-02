import SupplierRemoveRequestModel from './supplier.remove.request.model';
import supplierRemoveRequestController from './supplier.remove.requests.controller';
import supplierRemoveRequestsRoutes from './supplier.remove.requests.routes';

export default {
  model: SupplierRemoveRequestModel,
  controller: supplierRemoveRequestController,
  routes: supplierRemoveRequestsRoutes,
};
