import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const server = serve(
  {
    fetch: createApp(config).fetch,
    hostname: "0.0.0.0",
    port: config.port,
  },
  (info) => {
    console.info(`Hermes Chat UI listening on http://0.0.0.0:${info.port}`);
  },
);

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; stopping Hermes Chat UI`);
  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server cleanly:", error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    console.warn("Graceful shutdown deadline reached");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
