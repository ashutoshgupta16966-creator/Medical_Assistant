import app from "./app";
import { logger } from "./lib/logger";

const PORT = Number(process.env["PORT"]) || 5000;

app.listen(PORT, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: PORT }, "Server listening");
});
