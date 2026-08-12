import { Router } from 'express';
import productOffersController from './product.offers.controller';

const router = Router();

router
  .route('/')
  .get(productOffersController.list.bind(productOffersController))
  .post(productOffersController.create.bind(productOffersController));

router
  .route('/:_id')
  .get(productOffersController.getById.bind(productOffersController))
  .patch(productOffersController.update.bind(productOffersController))
  .delete(productOffersController.delete.bind(productOffersController));

export default router;
