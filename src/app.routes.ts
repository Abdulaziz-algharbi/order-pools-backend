import { Router } from 'express';

import apiRoutes from './routes/api';

const router = Router();

router.use('/api', apiRoutes);

export default router;
