import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const correlationIdHeader = "x-correlation-id";

export const correlationId: RequestHandler = (req, res, next) => {
  const incoming = req.header(correlationIdHeader);
  const value = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  res.locals.correlationId = value;
  res.setHeader(correlationIdHeader, value);
  next();
};
