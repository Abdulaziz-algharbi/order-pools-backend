import BaseController from '../base/base.controller';
import deliveryModel from './delivery.model';

class DeliveryController extends BaseController {
  constructor() {
    super(deliveryModel, []);
    this.logger.info('Delivery initialized');
  }

  // You can add additional methods specific to DeliveryController here
}

const deliveryController = new DeliveryController();

export default deliveryController;
