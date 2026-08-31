import { Request, Response, NextFunction } from 'express';

import type { UserRole } from '../services/users/user.model';
import ERRORS from '../constants/ERRORS';

/**
 * Must run after `tokenMiddleware` — relies on `req.meta.user` being set.
 * Responds 401 if no authenticated user is attached, 403 unless at least
 * one of the caller's roles (a user may hold more than one, e.g. an
 * approved supplier request adds SUPPLIER onto an existing RETAILER) is
 * in the allowed list.
 */
const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.meta?.user;

    if (!user) {
      return res.status(401).json({ message: 'Access token is missing' });
    }

    if (!user.roles.some((role) => roles.includes(role))) {
      return res.status(403).json({ message: ERRORS.UNAUTHORIZED });
    }

    next();
  };
};

export default requireRole;
