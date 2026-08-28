import { Router } from 'express';
import notificationController from './notifications.controller';
import {
  createNotificationSchema,
  updateNotificationSchema,
} from './notification.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(notificationController.list.bind(notificationController))
  .post(
    validate(createNotificationSchema),
    notificationController.create.bind(notificationController)
  );

router
  .route('/:_id')
  .get(notificationController.getById.bind(notificationController))
  .patch(
    validate(updateNotificationSchema),
    notificationController.update.bind(notificationController)
  )
  .delete(notificationController.delete.bind(notificationController));

export default router;
