import app from './app';

import connectToDB from './db/connect-to-db';
import config from './config/config';

function startServer(port: string | number) {
  return app.listen(port, function () {
    console.log(`Server is running on port ${port}`);
  });
}

connectToDB(config.mongoUri).then((connection) => {
  if (!connection)
    console.error('Failed to connect to the database. Server will not start.');

  const server = startServer(config.port);

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(async () => {
      console.log('HTTP server closed');
      if (connection) {
        await connection.disconnect();
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});
