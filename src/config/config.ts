import dotenv from 'dotenv';

dotenv.config();

interface IConfig {
  port: number;
  appMode: 'DEV' | 'PROD' | 'TEST' | 'STAGING';
  mongoUri: string;
  jwtTokenSecret: string;
  jwtTokenTtl: string;
  jwtRefreshTokenSecret: string;
  jwtRefreshTokenTtl: string;
}

const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  appMode: (process.env.APP_MODE || 'DEV') as
    'DEV' | 'PROD' | 'TEST' | 'STAGING',
  mongoUri:
    process.env[`${process.env.APP_MODE}_MONGO_URI`] ||
    'mongodb://localhost:27017/order-pool',
  jwtTokenSecret: process.env.JWT_TOKEN_SECRET || '',
  jwtTokenTtl: process.env.JWT_TOKEN_TTL || '1h',
  jwtRefreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || '',
  jwtRefreshTokenTtl: process.env.JWT_REFRESH_TOKEN_TTL || '7d',
} as IConfig;

export default config;
