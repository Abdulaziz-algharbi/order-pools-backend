import { Router } from 'express';
import complaintController from './complaints.controller';
import {
  createComplaintSchema,
  updateComplaintSchema,
} from './complaint.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(tokenMiddleware, complaintController.list.bind(complaintController))
  .post(
    tokenMiddleware,
    requireRole('RETAILER', 'SUPPLIER'),
    validate(createComplaintSchema),
    complaintController.create.bind(complaintController)
  );

router
  .route('/:_id')
  .get(tokenMiddleware, complaintController.getById.bind(complaintController))
  .patch(
    tokenMiddleware,
    validate(updateComplaintSchema),
    complaintController.update.bind(complaintController)
  )
  .delete(
    tokenMiddleware,
    requireRole('ADMIN'),
    complaintController.delete.bind(complaintController)
  );

export default router;
