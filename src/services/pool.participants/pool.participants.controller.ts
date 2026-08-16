import BaseController from '../base/base.controller';
import poolParticipantModel, { couldBeUpdated } from './pool.participant.model';

class PoolParticipantController extends BaseController {
  constructor() {
    super(poolParticipantModel, couldBeUpdated);
    this.logger.info('PoolParticipant initialized');
  }

  // You can add additional methods specific to PoolParticipant here
}
const poolParticipantController = new PoolParticipantController();

export default poolParticipantController;
