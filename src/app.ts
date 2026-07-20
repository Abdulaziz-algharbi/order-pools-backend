import express from 'express';
import morgan from 'morgan';

import appRoutes from './app.routes';

const app = express();

app.use(express.json());
app.use(morgan('dev'));
// app.use(cors());

app.use(appRoutes);

app.get('/ping', function (req, res) {
  res.send('pong');
});

export default app;
