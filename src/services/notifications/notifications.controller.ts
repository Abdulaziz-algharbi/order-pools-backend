import BaseController from '../base/base.controller';
import notificationModel, { couldBeUpdated } from './notification.model';

class NotificationController extends BaseController {
  constructor() {
    super(notificationModel, couldBeUpdated);
    this.logger.info('Notification initialized');
  }

  // You can add additional methods specific to NotificationController here
}

const notificationController = new NotificationController();

export default notificationController;
