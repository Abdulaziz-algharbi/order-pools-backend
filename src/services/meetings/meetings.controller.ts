import BaseController from '../base/base.controller';
import meetingModel, { couldBeUpdated } from './meeting.model';

class MeetingController extends BaseController {
  constructor() {
    super(meetingModel, couldBeUpdated);
  }

  // You can add additional methods specific to meetingController here
}

const meetingController = new MeetingController();

export default meetingController;
