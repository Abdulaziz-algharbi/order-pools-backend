import { Router } from 'express';

import meetingController from './meetings.controller';

const router = Router();

router
  .route('/')
  .get(meetingController.list.bind(meetingController))
  .post(meetingController.create.bind(meetingController));

router
  .route('/:_id')
  .get(meetingController.getById.bind(meetingController))
  .patch(meetingController.update.bind(meetingController))
  .delete(meetingController.delete.bind(meetingController));

export default router;
