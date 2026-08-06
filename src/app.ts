import express from 'express';
import morgan from 'morgan';

import appRoutes from './app.routes';

// services
import REGISTRY from './constants/REGISTRY';
import usersServices from './services/users';
import appRegistry from './app.registry';

const app = express();

app.use(express.json());
app.use(morgan('dev'));
// app.use(cors());

// register services in the app registry
appRegistry.register(REGISTRY.USER_MODEL, usersServices.model);
appRegistry.register(REGISTRY.USERS_CONTROLLER, usersServices.controller);

app.use(appRoutes);

app.get('/ping', function (req, res) {
  res.send('pong');
});

export default app;
