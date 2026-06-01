import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : "Unknown server error";

  res.status(500).json({
    error: "internal_server_error",
    message
  });
};
