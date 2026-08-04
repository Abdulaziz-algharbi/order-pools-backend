import { Router } from 'express';

import productsController from './products.controller';

const router = Router();

router
  .route('/')
  .get(productsController.list.bind(productsController))
  .post(productsController.create.bind(productsController));

router
  .route('/:_id')
  .get(productsController.getById.bind(productsController))
  .patch(productsController.update.bind(productsController))
  .delete(productsController.delete.bind(productsController));

export default router;
