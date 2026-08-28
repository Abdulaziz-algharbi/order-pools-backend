import { Router } from 'express';

import users from '../../../services/users';
import products from '../../../services/products';
import productOffers from '../../../services/product.offers';
import addresses from '../../../services/addresses';
import auth from '../../../services/auth';
import pools from '../../../services/pools';
import poolParticipants from '../../../services/pool.participants';
import payments from '../../../services/payments';
import supplierPayouts from '../../../services/supplier.payouts';
import shipments from '../../../services/shipments';
import distributionBatches from '../../../services/distribution.batches';
import deliveries from '../../../services/deliveries';
import complaints from '../../../services/complaints';
import notifications from '../../../services/notifications';

const router = Router();

router.use('/auth', auth.routes);
router.use('/users', users.routes);
router.use('/addresses', addresses.routes);
router.use('/products', products.routes);
router.use('/offers', productOffers.routes);
router.use('/pools', pools.routes);
router.use('/participants', poolParticipants.routes);
router.use('/payments', payments.routes);
router.use('/payouts', supplierPayouts.routes);
router.use('/shipments', shipments.routes);
router.use('/batches', distributionBatches.routes);
router.use('/deliveries', deliveries.routes);
router.use('/complaints', complaints.routes);
router.use('/notifications', notifications.routes);

export default router;
