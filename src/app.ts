import express from 'express';
const app = express();

const aziz = 'hello';
const phil = 'world';

app.get('/ping', function (req, res) {
  res.send('pong');
});

export default app;
