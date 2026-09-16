import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve frontend build if present (e.g. unified deployment on Render)
const clientDistCandidates = [
  path.resolve(__dirname, "../../medical-assistant/dist/public"),
  path.resolve(process.cwd(), "artifacts/medical-assistant/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];

const clientDist = clientDistCandidates.find((dir) => fs.existsSync(dir));

if (clientDist) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(clientDist, "index.html"));
      return;
    }
    next();
  });
}

export default app;
