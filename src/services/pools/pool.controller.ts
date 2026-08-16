import BaseController from '../base/base.controller';
import Pool, { couldBeUpdated } from './pool.model';

class PoolController extends BaseController {
  constructor() {
    super(Pool, couldBeUpdated);
    this.logger.info('Pool initialized');
  }
  // you can add additional methods specific to PoolController here
}

const poolController = new PoolController();

export default poolController;
