import { Request, Response, NextFunction } from 'express';

import type { UserRole } from '../services/users/user.model';
import ERRORS from '../constants/ERRORS';

/**
 * Must run after `tokenMiddleware` — relies on `req.meta.user` being set.
 * Responds 401 if no authenticated user is attached, 403 if their role
 * isn't one of the allowed roles.
 */
const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.meta?.user;

    if (!user) {
      return res.status(401).json({ message: 'Access token is missing' });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: ERRORS.UNAUTHORIZED });
    }

    next();
  };
};

export default requireRole;
