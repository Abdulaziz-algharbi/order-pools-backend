import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from 'jsonwebtoken';

import jwtUtil from '../utils/jwt.util';

// Like tokenMiddleware, but never rejects the request: a missing, invalid,
// or expired token just leaves req.meta.user unset instead of a 401/403,
// so the same route can serve both anonymous and authenticated callers
// (e.g. address creation, which must work before a user has registered).
const optionalTokenMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.meta = { user: undefined };
    return next();
  }

  try {
    const decoded = jwtUtil.verifyAccessToken(token) as JwtPayload | null;
    req.meta = {
      user: decoded?._id
        ? { userId: decoded._id, roles: decoded.roles }
        : undefined,
    };
  } catch {
    req.meta = { user: undefined };
  }

  next();
};

export default optionalTokenMiddleware;
