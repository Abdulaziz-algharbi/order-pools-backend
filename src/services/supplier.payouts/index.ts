import SupplierPayoutModel from './supplier.payout.model';
import supplierPayoutController from './supplier.payouts.controller';
import router from './supplier.payouts.routes';

export default {
  model: SupplierPayoutModel,
  controller: supplierPayoutController,
  routes: router,
};
