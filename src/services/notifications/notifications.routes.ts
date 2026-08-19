import { Router } from 'express';
import notificationController from './notifications.controller';

const router = Router();

router
  .route('/')
  .get(notificationController.list.bind(notificationController))
  .post(notificationController.create.bind(notificationController));

router
  .route('/:_id')
  .get(notificationController.getById.bind(notificationController))
  .patch(notificationController.update.bind(notificationController))
  .delete(notificationController.delete.bind(notificationController));

export default router;
