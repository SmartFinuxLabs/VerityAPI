import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import { correlationId, correlationIdHeader } from "../../src/middleware/correlation-id.js";

function mockResponse() {
  return {
    locals: {},
    setHeader: jest.fn()
  } as unknown as Response;
}

describe("correlationId middleware", () => {
  it("uses incoming correlation IDs when supplied", () => {
    const req = {
      header: jest.fn(() => "incoming-id")
    } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    correlationId(req, res, next);

    expect(res.locals.correlationId).toBe("incoming-id");
    expect(res.setHeader).toHaveBeenCalledWith(correlationIdHeader, "incoming-id");
    expect(next).toHaveBeenCalledWith();
  });

  it("generates correlation IDs when absent", () => {
    const req = {
      header: jest.fn(() => undefined)
    } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    correlationId(req, res, next);

    expect(res.locals.correlationId).toEqual(expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith(correlationIdHeader, res.locals.correlationId);
    expect(next).toHaveBeenCalledWith();
  });
});
