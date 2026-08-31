import { Router } from 'express';
import productOffersController from './product.offers.controller';
import {
  createProductOfferSchema,
  updateProductOfferSchema,
} from './product.offer.schema';
import { validate, tokenMiddleware, requireRole } from '../../middlewares';

const router = Router();

router
  .route('/')
  .get(
    tokenMiddleware,
    requireRole('SUPPLIER', 'ADMIN'),
    productOffersController.list.bind(productOffersController)
  )
  .post(
    tokenMiddleware,
    requireRole('SUPPLIER'),
    validate(createProductOfferSchema),
    productOffersController.create.bind(productOffersController)
  );

router
  .route('/:_id')
  .get(
    tokenMiddleware,
    requireRole('SUPPLIER', 'ADMIN'),
    productOffersController.getById.bind(productOffersController)
  )
  .patch(
    tokenMiddleware,
    requireRole('SUPPLIER', 'ADMIN'),
    validate(updateProductOfferSchema),
    productOffersController.update.bind(productOffersController)
  )
  .delete(
    tokenMiddleware,
    requireRole('SUPPLIER', 'ADMIN'),
    productOffersController.delete.bind(productOffersController)
  );

export default router;
