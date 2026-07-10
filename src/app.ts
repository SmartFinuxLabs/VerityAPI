import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { correlationId } from "./middleware/correlation-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { createApiRouter } from "./routes/index.js";

export type CreateAppOptions = {
  nodeEnv?: string;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const nodeEnv = options.nodeEnv ?? env.nodeEnv;

  app.use(helmet());
  app.use(cors());
  app.use(correlationId);
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(nodeEnv === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => {
    res.json({
      service: "verity-api",
      status: "running",
      apiBasePath: env.apiBasePath,
      health: `${env.apiBasePath}/health`
    });
  });

  app.use(env.apiBasePath, createApiRouter({ nodeEnv }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
