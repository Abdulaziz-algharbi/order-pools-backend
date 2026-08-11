import { Request, Response, NextFunction } from 'express';

import jwtUtil from '../utils/jwt.util';
import logger from '../logger/logger';

const tokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token is missing' });
  }

  try {
    const decoded = jwtUtil.verifyAccessToken(token);
    if (!decoded || !(decoded as any)._id) {
      return res.status(403).json({ message: 'Invalid access token' });
    }

    // TODO: fix typescript
    req.meta = {
      user: {
        userId: (decoded as any)._id,
      },
    };
    next();
  } catch (error) {
    logger.error(`Token verification failed: ${error}`);
    return res.status(403).json({ message: 'Invalid or expired access token' });
  }
};

export default tokenMiddleware;
