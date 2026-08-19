import BaseController from '../base/base.controller';
import shipmentModel, { couldBeUpdated } from './shipment.model';

class ShipmentController extends BaseController {
  constructor() {
    super(shipmentModel, couldBeUpdated);
    this.logger.info('Shipment initailized');
  }

  // You can add additional methods specific to ShipmentController here
}

const shipmentController = new ShipmentController();

export default shipmentController;
