import meetingModel from './meeting.model';
import meetingController from './meetings.controller';
import meetingRoutes from './meetings.routes';

export default {
  model: meetingModel,
  controller: meetingController,
  routers: meetingRoutes,
};
