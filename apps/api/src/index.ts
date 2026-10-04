import { createServer } from "node:http";
import { app } from "./app.js";
import { config } from "./config.js";
import { db, run, now } from "./db.js";
import { attachRealtime, processPushQueue } from "./notifications.js";
const server = createServer(app);
attachRealtime(server);
server.listen(config.port, config.host, () =>
  console.log(`Aone Mart API listening on ${config.host}:${config.port}`),
);
const worker = setInterval(() => {
  if (process.env.ENABLE_NOTIFICATIONS !== "true") return;
  void processPushQueue().catch(() =>
    console.error("Notification worker unavailable"),
  );
}, 5000);
worker.unref();
const cleanup = setInterval(() => {
  void (async () => {
    await run("DELETE FROM refresh_sessions WHERE expires_at<?", now());
    await run(
      "DELETE FROM import_batches WHERE status='preview' AND created_at<?",
      new Date(Date.now() - 7 * 86400000).toISOString(),
    );
  })().catch(() => console.error("Database cleanup unavailable"));
}, 3600000);
cleanup.unref();
function stop() {
  clearInterval(worker);
  clearInterval(cleanup);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
