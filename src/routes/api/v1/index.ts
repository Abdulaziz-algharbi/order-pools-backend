import { Router } from 'express';

import users from '../../../services/users';

const router = Router();

router.use('/users', users.routes);

export default router;
