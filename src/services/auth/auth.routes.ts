import { Router } from 'express';

import authController from './auth.controller';
import tokenMiddleware from '../../middlewares/token.middleware';

const router = Router();

router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.get('/me', tokenMiddleware, authController.me.bind(authController));

export default router;
