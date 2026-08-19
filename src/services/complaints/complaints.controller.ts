import BaseController from '../base/base.controller';
import complaintModel, { couldBeUpdated } from './complaint.model';

class ComplaintController extends BaseController {
  constructor() {
    super(complaintModel, couldBeUpdated);
    this.logger.info('Complaint initialized');
  }

  // You can add additional methods specific to ComplaintController here
}

const complaintController = new ComplaintController();

export default complaintController;
