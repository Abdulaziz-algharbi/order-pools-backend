import { Router } from 'express';
import poolParticipantController from './pool.participants.controller';

const router = Router();

router
  .route('/')
  .get(poolParticipantController.list.bind(poolParticipantController))
  .post(poolParticipantController.create.bind(poolParticipantController));

router
  .route('/:_id')
  .get(poolParticipantController.getById.bind(poolParticipantController))
  .patch(poolParticipantController.update.bind(poolParticipantController))
  .delete(poolParticipantController.delete.bind(poolParticipantController));

export default router;
