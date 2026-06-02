import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "verity-api",
    correlationId: res.locals.correlationId,
    timestamp: new Date().toISOString()
  });
});
