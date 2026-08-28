import { Router } from 'express';
import productOffersController from './product.offers.controller';
import {
  createProductOfferSchema,
  updateProductOfferSchema,
} from './product.offer.schema';
import { validate } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(productOffersController.list.bind(productOffersController))
  .post(
    validate(createProductOfferSchema),
    productOffersController.create.bind(productOffersController)
  );

router
  .route('/:_id')
  .get(productOffersController.getById.bind(productOffersController))
  .patch(
    validate(updateProductOfferSchema),
    productOffersController.update.bind(productOffersController)
  )
  .delete(productOffersController.delete.bind(productOffersController));

export default router;
