import { Router } from 'express';

import users from '../../../services/users';
import products from '../../../services/products';
import productOffers from '../../../services/product.offers';
import meetings from '../../../services/meetings';
import addresses from '../../../services/addresses';
import auth from '../../../services/auth';
import pools from '../../../services/pools';
import poolParticipants from '../../../services/pool.participants';

const router = Router();

router.use('/auth', auth.routes);
router.use('/users', users.routes);
router.use('/addresses', addresses.routers);
router.use('/products', products.routes);
router.use('/productOffers', productOffers.routes);
router.use('/meetings', meetings.routers);
router.use('/pools', pools.routes);
router.use('/poolParticipants', poolParticipants.routes);

export default router;
