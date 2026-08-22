import { Router } from 'express';

import authController from './auth.controller';
import { tokenMiddleware, validate } from '../../middlewares';
import { registerSchema } from './auth.schema';

const router = Router();

router.post(
  '/register',
  validate(registerSchema),
  authController.register.bind(authController)
);
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.get('/me', tokenMiddleware, authController.me.bind(authController));

export default router;
