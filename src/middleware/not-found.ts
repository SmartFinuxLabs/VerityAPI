import type { RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ApiError({
      statusCode: 404,
      code: "not_found",
      message: `No route matches ${req.method} ${req.originalUrl}.`,
      reasonCode: "ERR_NOT_FOUND"
    })
  );
};
