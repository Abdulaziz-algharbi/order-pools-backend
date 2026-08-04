import { Router } from 'express';

import users from '../../../services/users';
import products from '../../../services/products';
import productOffers from '../../../services/productOffers';
import meetings from '../../../services/meetings';
import addresses from '../../../services/addresses';

const router = Router();

router.use('/users', users.routes);
router.use('/products', products.routes);
router.use('/productOffers', productOffers.routes);
router.use('/meetings', meetings.routers);
router.use('/addresses', addresses.routers)

export default router;
