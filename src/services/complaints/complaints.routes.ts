import { Router } from 'express';
import complaintController from './complaints.controller';

const router = Router();

router
  .route('/')
  .get(complaintController.list.bind(complaintController))
  .post(complaintController.create.bind(complaintController));

router
  .route('/:_id')
  .get(complaintController.getById.bind(complaintController))
  .patch(complaintController.update.bind(complaintController))
  .delete(complaintController.delete.bind(complaintController));

export default router;
