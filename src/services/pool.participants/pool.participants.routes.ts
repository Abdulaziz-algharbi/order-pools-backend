import { Router } from 'express';
import poolParticipantController from './pool.participants.controller';
import {
  createPoolParticipantSchema,
  updatePoolParticipantSchema,
} from './pool.participant.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'RETAILER'),
    poolParticipantController.list.bind(poolParticipantController)
  )
  .post(
    tokenMiddleware,
    requireRole('RETAILER'),
    validate(createPoolParticipantSchema),
    poolParticipantController.create.bind(poolParticipantController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'RETAILER'),
    poolParticipantController.getById.bind(poolParticipantController)
  )
  .patch(
    tokenMiddleware,
    requireRole('RETAILER'),
    validate(updatePoolParticipantSchema),
    poolParticipantController.update.bind(poolParticipantController)
  )
  .delete(
    tokenMiddleware,
    requireRole('RETAILER'),
    poolParticipantController.delete.bind(poolParticipantController)
  );

export default router;
