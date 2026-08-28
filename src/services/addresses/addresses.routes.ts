import { Router } from 'express';

import addressesController from './addresses.controller';
import { createAddressSchema, updateAddressSchema } from './address.schema';
import { validate } from '../../middlewares';

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
  .patch(
    validate(updateAddressSchema),
    addressesController.update.bind(addressesController)
  )
  .delete(addressesController.delete.bind(addressesController));

export default router;
