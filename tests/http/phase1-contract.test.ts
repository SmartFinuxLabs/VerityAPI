import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../src/app.js";

const memberToken = "Bearer test:user-1:SUPPLIER:MEMBER";
const viewerToken = "Bearer test:user-2:BUYER:VIEWER";
const operatorToken = "Bearer test:operator-1:OPERATOR:SUPER_USER";

describe("Phase 1 HTTP API contract", () => {
  const app = createApp();

  describe("happy path", () => {
    it("returns health status with correlation metadata", async () => {
      const response = await request(app)
        .get("/api/v1/health")
        .set("X-Correlation-Id", "test-correlation-id")
        .expect(200);

      expect(response.headers["x-correlation-id"]).toBe("test-correlation-id");
      expect(response.body).toEqual({
        ok: true,
        service: "verity-api",
        correlationId: "test-correlation-id",
        timestamp: expect.any(String)
      });
    });

    it("validates protected domain routes when a valid token is supplied", async () => {
      const response = await request(app)
        .post("/api/v1/invoices")
        .set("Authorization", memberToken)
        .send({
          relationshipId: "rel-1",
          supplierId: "supplier-1",
          buyerId: "buyer-1",
          invoiceNumber: "INV-001"
        })
        .expect(400);

      expect(response.body).toMatchObject({
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
        correlationId: expect.any(String)
      });
    });

    it("exposes protected workspace data routes for VerityUI API mode", async () => {
      const response = await request(app)
        .get("/api/v1/workspaces/buyer")
        .set("Authorization", memberToken)
        .expect(500);

      expect(response.body).toMatchObject({
        code: "supabase_not_configured",
        reasonCode: "ERR_INTERNAL_SERVER_ERROR",
        message: "Supabase workspace state requires SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY with a verified user access token."
      });
    });

    it("exposes implemented public auth contract routes for VerityUI", async () => {
      const response = await request(app)
        .post("/api/v1/auth/sign-in")
        .send({ email: "you@company.com" })
        .expect(400);

      expect(response.body).toMatchObject({
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
        message: "email and password are required."
      });
    });
  });

  describe("sad path", () => {
    it("returns 400 for malformed JSON request bodies", async () => {
      const response = await request(app)
        .post("/api/v1/invoices")
        .set("Authorization", memberToken)
        .set("Content-Type", "application/json")
        .send("{")
        .expect(400);

      expect(response.body).toMatchObject({
        code: "invalid_json",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
        message: "Request body must be valid JSON.",
        correlationId: expect.any(String)
      });
    });

    it("returns 404 with the standard envelope for unknown authenticated routes", async () => {
      const response = await request(app)
        .get("/api/v1/does-not-exist")
        .set("Authorization", memberToken)
        .expect(404);

      expect(response.body).toMatchObject({
        code: "not_found",
        reasonCode: "ERR_NOT_FOUND",
        message: "No route matches GET /api/v1/does-not-exist.",
        correlationId: expect.any(String)
      });
    });
  });

  describe("security and authorization", () => {
    it("returns 401 when a protected route has no bearer token", async () => {
      const response = await request(app).post("/api/v1/invoices").send({}).expect(401);

      expect(response.body).toMatchObject({
        code: "unauthorized",
        reasonCode: "ERR_UNAUTHORIZED",
        message: "A bearer token is required."
      });
    });

    it("returns 401 when a token is malformed or expired", async () => {
      const malformed = await request(app)
        .post("/api/v1/invoices")
        .set("Authorization", "Bearer not-a-supported-token")
        .send({})
        .expect(401);

      expect(malformed.body).toMatchObject({
        code: "unauthorized",
        reasonCode: "ERR_UNAUTHORIZED",
        message: "Bearer token is malformed, expired, or unsupported."
      });

      const expired = await request(app)
        .post("/api/v1/invoices")
        .set("Authorization", "Bearer test:expired:SUPPLIER:MEMBER")
        .send({})
        .expect(401);

      expect(expired.body).toMatchObject({
        code: "unauthorized",
        reasonCode: "ERR_UNAUTHORIZED"
      });
    });

    it("returns 403 when a viewer attempts a mutating operation", async () => {
      const response = await request(app)
        .post("/api/v1/invoices")
        .set("Authorization", viewerToken)
        .send({})
        .expect(403);

      expect(response.body).toMatchObject({
        code: "forbidden",
        reasonCode: "ERR_FORBIDDEN",
        message: "Viewer role is read-only for Phase 1 API operations."
      });
    });

    it("returns 403 when a non-operator attempts to access audit events", async () => {
      const response = await request(app)
        .get("/api/v1/audit/events")
        .set("Authorization", memberToken)
        .expect(403);

      expect(response.body).toMatchObject({
        code: "forbidden",
        reasonCode: "ERR_FORBIDDEN",
        message: "Operator role is required for this API operation."
      });
    });

    it("allows operators to reach the audit domain route", async () => {
      const response = await request(app)
        .get("/api/v1/audit/events")
        .set("Authorization", operatorToken)
        .expect(500);

      expect(response.body).toMatchObject({
        code: "supabase_not_configured",
        reasonCode: "ERR_INTERNAL_SERVER_ERROR"
      });
    });
  });
});
