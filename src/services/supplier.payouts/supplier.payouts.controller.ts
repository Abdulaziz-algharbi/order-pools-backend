import BaseController from '../base/base.controller';
import SupplierModel from './supplier.payout.model';

class SupplierPayoutController extends BaseController {
  constructor() {
    super(SupplierModel, []);
    this.logger.info('SupplierPayout initialized');
  }

  // You can add additional methods specific to Payment here
}

const supplierPayoutController = new SupplierPayoutController();

export default supplierPayoutController;
