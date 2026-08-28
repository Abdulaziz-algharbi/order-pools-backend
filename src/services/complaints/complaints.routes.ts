import { Router } from 'express';
import complaintController from './complaints.controller';
import {
  createComplaintSchema,
  updateComplaintSchema,
} from './complaint.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(complaintController.list.bind(complaintController))
  .post(
    validate(createComplaintSchema),
    complaintController.create.bind(complaintController)
  );

router
  .route('/:_id')
  .get(complaintController.getById.bind(complaintController))
  .patch(
    validate(updateComplaintSchema),
    complaintController.update.bind(complaintController)
  )
  .delete(complaintController.delete.bind(complaintController));

export default router;
