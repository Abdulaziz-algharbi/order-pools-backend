import BaseController from '../base/base.controller';
import distributionBatchModel, {
  couldBeUpdated,
} from './distribution.batch.model';

class DistributionBatchController extends BaseController {
  constructor() {
    super(distributionBatchModel, couldBeUpdated);
    this.logger.info('Batch initialized');
  }

  // You can add additional methods specific to DistributionBatchController here
}

const distributionBatchController = new DistributionBatchController();

export default distributionBatchController;
