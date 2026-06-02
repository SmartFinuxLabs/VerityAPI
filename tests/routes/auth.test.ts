import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createAuthRouter, type AuthService } from "../../src/routes/auth.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

function createAuthTestApp(authService: AuthService) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createAuthRouter(authService));
  app.use(errorHandler);
  return app;
}

describe("auth routes", () => {
  it("signs in through the configured auth service", async () => {
    const authService: AuthService = {
      getRoleHint: jest.fn(),
      signIn: jest.fn(async () => ({
        session: {
          user: {
            id: "user_123",
            email: "buyer@test.local",
            userMetadata: { participantRole: "Buyer" }
          },
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: "2026-06-01T12:00:00.000Z"
        }
      })),
      register: jest.fn()
    };

    const response = await request(createAuthTestApp(authService))
      .post("/api/v1/auth/sign-in")
      .send({ email: "buyer@test.local", password: "secret-password" })
      .expect(200);

    expect(authService.signIn).toHaveBeenCalledWith({
      email: "buyer@test.local",
      password: "secret-password"
    });
    expect(response.body).toEqual({
      data: {
        session: {
          user: {
            id: "user_123",
            email: "buyer@test.local",
            userMetadata: { participantRole: "Buyer" }
          },
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: "2026-06-01T12:00:00.000Z"
        }
      }
    });
  });

  it("returns 400 when sign-in credentials are missing", async () => {
    const authService: AuthService = {
      getRoleHint: jest.fn(),
      signIn: jest.fn(),
      register: jest.fn()
    };

    const response = await request(createAuthTestApp(authService))
      .post("/api/v1/auth/sign-in")
      .send({ email: "buyer@test.local" })
      .expect(400);

    expect(authService.signIn).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
      message: "email and password are required."
    });
  });

  it("returns role hints from the auth service", async () => {
    const authService: AuthService = {
      getRoleHint: jest.fn(async () => ({
        participantRole: "BUYER",
        organizationRole: "MEMBER",
        organizationName: "Acme Buyer"
      })),
      signIn: jest.fn(),
      register: jest.fn()
    };

    const response = await request(createAuthTestApp(authService))
      .get("/api/v1/auth/role-hint")
      .query({ email: "buyer@test.local" })
      .expect(200);

    expect(authService.getRoleHint).toHaveBeenCalledWith("buyer@test.local");
    expect(response.body).toEqual({
      data: {
        participantRole: "BUYER",
        organizationRole: "MEMBER",
        organizationName: "Acme Buyer"
      }
    });
  });

  it("registers users through the configured auth service", async () => {
    const authService: AuthService = {
      getRoleHint: jest.fn(),
      signIn: jest.fn(),
      register: jest.fn(async () => ({
        session: {
          user: {
            id: "user_456",
            email: "supplier@test.local",
            userMetadata: { participantRole: "Supplier" }
          },
          accessToken: "new-access-token"
        },
        confirmationRequired: false
      }))
    };

    const payload = {
      email: "supplier@test.local",
      password: "secret-password",
      fullName: "Supplier User",
      entityName: "Supplier LLC",
      participantRole: "Supplier",
      partyType: "SUPPLIER",
      invitationToken: "invite_123"
    };

    const response = await request(createAuthTestApp(authService))
      .post("/api/v1/auth/register")
      .send(payload)
      .expect(201);

    expect(authService.register).toHaveBeenCalledWith(payload);
    expect(response.body).toEqual({
      data: {
        session: {
          user: {
            id: "user_456",
            email: "supplier@test.local",
            userMetadata: { participantRole: "Supplier" }
          },
          accessToken: "new-access-token"
        },
        confirmationRequired: false
      }
    });
  });

  it("rejects registration with mismatched participant role and party type", async () => {
    const authService: AuthService = {
      getRoleHint: jest.fn(),
      signIn: jest.fn(),
      register: jest.fn()
    };

    const response = await request(createAuthTestApp(authService))
      .post("/api/v1/auth/register")
      .send({
        email: "buyer@test.local",
        password: "secret-password",
        fullName: "Buyer User",
        entityName: "Buyer LLC",
        participantRole: "Buyer",
        partyType: "SUPPLIER"
      })
      .expect(400);

    expect(authService.register).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
      message: "participantRole and partyType must describe the same buyer, supplier, or investor actor type."
    });
  });
});
