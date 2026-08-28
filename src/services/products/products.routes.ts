import { Router } from 'express';

import productsController from './products.controller';
import { createProductSchema, updateProductSchema } from './product.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(productsController.list.bind(productsController))
  .post(
    validate(createProductSchema),
    productsController.create.bind(productsController)
  );

router
  .route('/:_id')
  .get(productsController.getById.bind(productsController))
  .patch(
    validate(updateProductSchema),
    productsController.update.bind(productsController)
  )
  .delete(productsController.delete.bind(productsController));

export default router;
