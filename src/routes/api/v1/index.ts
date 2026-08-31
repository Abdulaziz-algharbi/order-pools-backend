import { Router } from 'express';

import users from '../../../services/users';
import productOffers from '../../../services/product.offers';
import addresses from '../../../services/addresses';
import auth from '../../../services/auth';
import pools from '../../../services/pools';
import poolParticipants from '../../../services/pool.participants';
import payments from '../../../services/payments';
import supplierPayouts from '../../../services/supplier.payouts';
import supplierRequests from '../../../services/supplier.requests';
import deliveries from '../../../services/deliveries';
import complaints from '../../../services/complaints';
import notifications from '../../../services/notifications';

const router = Router();

router.use('/auth', auth.routes);
router.use('/users', users.routes);
router.use('/addresses', addresses.routes);
router.use('/offers', productOffers.routes);
router.use('/pools', pools.routes);
router.use('/participants', poolParticipants.routes);
router.use('/payments', payments.routes);
router.use('/payouts', supplierPayouts.routes);
router.use('/supplier-requests', supplierRequests.routes);
router.use('/deliveries', deliveries.routes);
router.use('/complaints', complaints.routes);
router.use('/notifications', notifications.routes);

export default router;
