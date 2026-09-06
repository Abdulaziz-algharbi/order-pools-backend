import { Router } from 'express';
import poolParticipantController from './pool.participants.controller';
import { createPoolParticipantSchema } from './pool.participant.schema';
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

// No PATCH route — quantity is no longer patchable (see
// pool.participant.model.ts couldBeUpdated). Withdraw and rejoin instead.
router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('ADMIN', 'RETAILER'),
    poolParticipantController.getById.bind(poolParticipantController)
  )
  .delete(
    tokenMiddleware,
    requireRole('RETAILER'),
    poolParticipantController.delete.bind(poolParticipantController)
  );

export default router;
