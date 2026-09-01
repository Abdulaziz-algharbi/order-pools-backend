import { Router } from 'express';
import notificationController from './notifications.controller';
import {
  createNotificationSchema,
  updateNotificationSchema,
} from './notification.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('RETAILER', 'SUPPLIER', 'ADMIN'),
    notificationController.list.bind(notificationController)
  )
  .post(
    tokenMiddleware,
    requireRole('ADMIN'),
    validate(createNotificationSchema),
    notificationController.create.bind(notificationController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('RETAILER', 'SUPPLIER', 'ADMIN'),
    notificationController.getById.bind(notificationController)
  )
  .patch(
    tokenMiddleware,
    requireRole('RETAILER', 'SUPPLIER', 'ADMIN'),
    validate(updateNotificationSchema),
    notificationController.update.bind(notificationController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    notificationController.delete.bind(notificationController)
  );

export default router;
