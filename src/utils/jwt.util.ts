import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../config/config';
import logger from '../logger/logger';
import type { UserRole } from '../services/users/user.model';

declare module 'jsonwebtoken' {
  export interface JwtPayload {
    _id: string;
    roles: UserRole[];
  }
}

class JwtUtil {
  createAccessToken(payload: object) {
    const secret = config.jwtTokenSecret;
    return jwt.sign(payload, secret, {
      expiresIn: config.jwtTokenTtl as SignOptions['expiresIn'],
    });
  }
  createRefreshToken(payload: object) {
    const secret = config.jwtRefreshTokenSecret;
    return jwt.sign(payload, secret, {
      expiresIn: config.jwtRefreshTokenTtl as SignOptions['expiresIn'],
    });
  }
  createTokens(payload: object) {
    const accessToken = this.createAccessToken(payload);
    const refreshToken = this.createRefreshToken(payload);
    return { accessToken, refreshToken };
  }
  verifyAccessToken(token: string) {
    const secret = config.jwtTokenSecret;
    try {
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      logger.error(`Access token verification failed: ${error}`);
      return null;
    }
  }
  verifyRefreshToken(token: string) {
    const secret = config.jwtRefreshTokenSecret;
    try {
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      logger.error(`Refresh token verification failed: ${error}`);
      return null;
    }
  }
}

const jwtUtil = new JwtUtil();

export default jwtUtil;
