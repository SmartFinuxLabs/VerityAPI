import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import { ApiError } from "../../src/errors/api-error.js";
import { notFoundHandler } from "../../src/middleware/not-found.js";

describe("notFoundHandler", () => {
  it("forwards a standard 404 ApiError", () => {
    const req = {
      method: "PATCH",
      originalUrl: "/api/v1/missing"
    } as Request;
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    notFoundHandler(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 404,
      code: "not_found",
      message: "No route matches PATCH /api/v1/missing.",
      reasonCode: "ERR_NOT_FOUND"
    });
  });
});
