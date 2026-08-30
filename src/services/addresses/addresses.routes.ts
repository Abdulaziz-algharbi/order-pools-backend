import { Router } from 'express';

import addressesController from './addresses.controller';
import { createAddressSchema, updateAddressSchema } from './address.schema';
import {
  validate,
  tokenMiddleware,
  optionalTokenMiddleware,
} from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(tokenMiddleware, addressesController.list.bind(addressesController))
  .post(
    optionalTokenMiddleware,
    validate(createAddressSchema),
    addressesController.create.bind(addressesController)
  );

router
  .route('/:_id')
  .get(tokenMiddleware, addressesController.getById.bind(addressesController))
  .patch(
    tokenMiddleware,
    validate(updateAddressSchema),
    addressesController.update.bind(addressesController)
  )
  .delete(
    tokenMiddleware,
    addressesController.delete.bind(addressesController)
  );

export default router;
