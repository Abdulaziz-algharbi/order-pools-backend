import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import appRoutes from './app.routes';
import config from './config/config';

// registry
import REGISTRY from './constants/REGISTRY';
import appRegistry from './app.registry';

// services
import usersService from './services/users';
import emailsService from './services/emails';
import logger from './logger/logger';

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: config.frontendUrl }));

// register services in the app registry
// models
appRegistry.register(REGISTRY.USER_MODEL, usersService.model);
// controllers
appRegistry.register(REGISTRY.USERS_CONTROLLER, usersService.controller);
appRegistry.register(REGISTRY.EMAILS_CONTROLLER, emailsService.controller);

app.use(appRoutes);

app.get('/ping', function (req, res) {
  logger.info('Ping request received', { timestamp: new Date().toISOString() });
  res.send('pong');
});

export default app;
