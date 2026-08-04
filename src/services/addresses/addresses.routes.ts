import { Router } from 'express';

import addressesController from './addresses.controller';

const router = Router();

router
  .route('/')
  .get(addressesController.list.bind(addressesController))
  .post(addressesController.create.bind(addressesController));

router
  .route('/:_id')
  .get(addressesController.getById.bind(addressesController))
  .patch(addressesController.update.bind(addressesController))
  .delete(addressesController.delete.bind(addressesController));

export default router;
