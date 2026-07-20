import express from 'express';
const app = express();

const aziz = 'hello';

app.get('/ping', function (req, res) {
  res.send('pong');
});

export default app;
