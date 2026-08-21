import { Router } from 'express';

import addressesController from './addresses.controller';
import { createAddressSchema } from './address.schema';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

router
  .route('/')
  .get(addressesController.list.bind(addressesController))
  .post(
    validate(createAddressSchema),
    addressesController.create.bind(addressesController)
  );

router
  .route('/:_id')
  .get(addressesController.getById.bind(addressesController))
  .patch(addressesController.update.bind(addressesController))
  .delete(addressesController.delete.bind(addressesController));

export default router;
