import app from "./app";

function startServer(port: string | number) {
  return app.listen(port, function () {
    console.log(`Server is running on port ${port}`);
  });
}

startServer(8000);
