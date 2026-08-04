import BaseController from '../base/base.controller';

import AddressModel, { couldBeUpdated } from './address.model';

class AddressController extends BaseController {
  constructor() {
    super(AddressModel, couldBeUpdated);
  }
}

const addressesController = new AddressController();

export default addressesController;
