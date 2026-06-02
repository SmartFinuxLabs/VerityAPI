import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import { ApiError } from "../../src/errors/api-error.js";
import { blockViewerMutations, createRequireAuth, requireAuth, requireOperator } from "../../src/middleware/auth.js";

function mockRequest(params: { method?: string; authorization?: string } = {}) {
  return {
    method: params.method ?? "GET",
    header: jest.fn((name: string) => {
      if (name.toLowerCase() === "authorization") return params.authorization;
      return undefined;
    })
  } as unknown as Request;
}

function mockResponse(auth?: unknown) {
  return {
    locals: auth === undefined ? {} : { auth }
  } as Response;
}

function mockNext() {
  return jest.fn() as jest.MockedFunction<NextFunction>;
}

describe("auth middleware", () => {
  describe("requireAuth", () => {
    it("stores auth context for valid bearer tokens", async () => {
      const req = mockRequest({ authorization: "Bearer test:user-1:SUPPLIER:MEMBER" });
      const res = mockResponse();
      const next = mockNext();

      await requireAuth(req, res, next);

      expect(res.locals.auth).toEqual({
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      });
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects missing bearer tokens", async () => {
      const next = mockNext();

      await requireAuth(mockRequest(), mockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 401,
        reasonCode: "ERR_UNAUTHORIZED"
      });
    });

    it("rejects malformed bearer tokens", async () => {
      const next = mockNext();

      await createRequireAuth({
        verifyAccessToken: jest.fn(async () => {
          throw new ApiError({
            statusCode: 401,
            code: "auth_failure",
            message: "Bearer token is malformed, expired, or unsupported.",
            reasonCode: "AUTH_FAILURE"
          });
        })
      })(
        mockRequest({ authorization: "Bearer not-a-supported-token" }),
        mockResponse(),
        next
      );

      expect(next.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 401,
        reasonCode: "ERR_UNAUTHORIZED"
      });
    });

    it("stores auth context from a verified Supabase access token", async () => {
      const req = mockRequest({ authorization: "Bearer supabase-access-token" });
      const res = mockResponse();
      const next = mockNext();
      const verifyAccessToken = jest.fn(async () => ({
        userId: "supabase-user-1",
        participantRole: "BUYER" as const,
        organizationRole: "SUPER_USER" as const
      }));

      await createRequireAuth({ verifyAccessToken })(req, res, next);

      expect(verifyAccessToken).toHaveBeenCalledWith("supabase-access-token");
      expect(res.locals.auth).toEqual({
        userId: "supabase-user-1",
        participantRole: "BUYER",
        organizationRole: "SUPER_USER"
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("blockViewerMutations", () => {
    it("allows non-mutating viewer requests", () => {
      const next = mockNext();

      blockViewerMutations(
        mockRequest({ method: "GET" }),
        mockResponse({ organizationRole: "VIEWER" }),
        next
      );

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects mutating viewer requests", () => {
      const next = mockNext();

      blockViewerMutations(
        mockRequest({ method: "POST" }),
        mockResponse({ organizationRole: "VIEWER" }),
        next
      );

      expect(next.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 403,
        reasonCode: "ERR_FORBIDDEN"
      });
    });
  });

  describe("requireOperator", () => {
    it("allows operator requests", () => {
      const next = mockNext();

      requireOperator(
        mockRequest(),
        mockResponse({ participantRole: "OPERATOR" }),
        next
      );

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects non-operator requests", () => {
      const next = mockNext();

      requireOperator(
        mockRequest(),
        mockResponse({ participantRole: "SUPPLIER" }),
        next
      );

      expect(next.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 403,
        reasonCode: "ERR_FORBIDDEN"
      });
    });
  });
});
