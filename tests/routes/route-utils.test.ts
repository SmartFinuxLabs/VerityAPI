import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import { ApiError } from "../../src/errors/api-error.js";
import { contractStub } from "../../src/routes/route-utils.js";

describe("contractStub", () => {
  it("forwards a not implemented ApiError for the named operation", () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    contractStub("Create invoice")({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 501,
      code: "not_implemented",
      message: "Create invoice is defined in the Phase 1 API contract but is not implemented yet.",
      reasonCode: "ERR_NOT_IMPLEMENTED"
    });
  });
});
