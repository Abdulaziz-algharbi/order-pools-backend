import dotenv from 'dotenv';

dotenv.config();

interface IConfig {
  port: number;
  appMode: 'DEV' | 'PROD' | 'TEST' | 'STAGING';
  mongoUri: string;
  frontendUrl: string;
  jwtTokenSecret: string;
  jwtTokenTtl: string;
  jwtRefreshTokenSecret: string;
  jwtRefreshTokenTtl: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  appMode: (process.env.APP_MODE || 'DEV') as
    'DEV' | 'PROD' | 'TEST' | 'STAGING',
  mongoUri:
    process.env[`${process.env.APP_MODE}_MONGO_URI`] ||
    'mongodb://localhost:27017/order-pool',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtTokenSecret: process.env.JWT_TOKEN_SECRET || '',
  jwtTokenTtl: process.env.JWT_TOKEN_TTL || '1h',
  jwtRefreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || '',
  jwtRefreshTokenTtl: process.env.JWT_REFRESH_TOKEN_TTL || '7d',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
} as IConfig;

export default config;
