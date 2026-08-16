import { Router } from 'express';

import users from '../../../services/users';
import products from '../../../services/products';
import productOffers from '../../../services/product.offers';
import meetings from '../../../services/meetings';
import addresses from '../../../services/addresses';
import auth from '../../../services/auth';
import pools from '../../../services/pools';
import poolParticipants from '../../../services/pool.participants';
import payments from '../../../services/payments';
import supplierPayouts from '../../../services/supplier.payouts';

const router = Router();

router.use('/auth', auth.routes);
router.use('/users', users.routes);
router.use('/addresses', addresses.routes);
router.use('/products', products.routes);
router.use('/productOffers', productOffers.routes);
router.use('/meetings', meetings.routes);
router.use('/pools', pools.routes);
router.use('/poolParticipants', poolParticipants.routes);
router.use('/payments', payments.routes);
router.use('/supplierPayouts', supplierPayouts.routes);

export default router;
