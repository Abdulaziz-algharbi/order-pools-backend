import BaseController from '../base/base.controller';
import paymentModel, { couldBeUpdated } from './payment.model';

class PaymentController extends BaseController {
  constructor() {
    super(paymentModel, couldBeUpdated);
    this.logger.info('Payment initialized');
  }

  // You can add additional methods specific to Payment here
}
const paymentController = new PaymentController();

export default paymentController;
