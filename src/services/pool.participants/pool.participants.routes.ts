import { Router } from 'express';
import poolParticipantController from './pool.participants.controller';
import {
  createPoolParticipantSchema,
  updatePoolParticipantSchema,
} from './pool.participant.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(poolParticipantController.list.bind(poolParticipantController))
  .post(
    validate(createPoolParticipantSchema),
    poolParticipantController.create.bind(poolParticipantController)
  );

router
  .route('/:_id')
  .get(poolParticipantController.getById.bind(poolParticipantController))
  .patch(
    validate(updatePoolParticipantSchema),
    poolParticipantController.update.bind(poolParticipantController)
  )
  .delete(poolParticipantController.delete.bind(poolParticipantController));

export default router;
