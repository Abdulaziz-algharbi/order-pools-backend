import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import appRoutes from './app.routes';
import config from './config/config';

// services
// `emails` has no routes of its own — this import's only job is to load
// the singleton so its listeners() hook (BaseController's constructor)
// subscribes to `user:registered` on AppBroker before anything can emit it.
import './services/emails';
import logger from './logger/logger';

const app = express();

// Trusts exactly one hop upstream (the nginx reverse proxy) so req.ip /
// req.protocol reflect the real client from X-Forwarded-For/-Proto
// instead of the proxy itself.
app.set('trust proxy', 1);

app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: config.frontendUrl }));

app.use(appRoutes);

app.get('/ping', function (req, res) {
  logger.info('Ping request received', { timestamp: new Date().toISOString() });
  res.send('pong');
});

export default app;
