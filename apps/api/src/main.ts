import "dotenv/config";
import { createApp } from "./app";
import { assertEnvironment } from "./config";
assertEnvironment();
void createApp().then((app) =>
  app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? "127.0.0.1"),
);
