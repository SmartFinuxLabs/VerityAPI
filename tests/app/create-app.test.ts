import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("createApp", () => {
  it("wires the root service status route", async () => {
    const response = await request(createApp()).get("/").expect(200);

    expect(response.body).toEqual({
      service: "verity-api",
      status: "running",
      apiBasePath: "/api/v1",
      health: "/api/v1/health"
    });
  });

  it("serves the OpenAPI document without authentication", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);

    expect(response.body).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "Verity API"
      },
      paths: {
        "/api/v1/health": expect.any(Object),
        "/api/v1/auth/sign-in": expect.any(Object)
      }
    });
  });

  it("serves API docs without authentication", async () => {
    const response = await request(createApp()).get("/api/v1/api-docs").expect(200);

    expect(response.header["content-type"]).toMatch(/^text\/html/);
    expect(response.text).toContain("Verity API Docs");
    expect(response.text).toContain("swagger-ui");
    expect(response.text).not.toContain("SwaggerUIBundle({");
  });

  it("serves Swagger UI browser assets without authentication locally", async () => {
    const response = await request(createApp()).get("/api/v1/api-docs/swagger-ui-bundle.js").expect(200);

    expect(response.header["content-type"]).toMatch(/^application\/javascript/);
    expect(response.text).toContain("SwaggerUIBundle");
  });

  it("requires authentication for the OpenAPI document in production", async () => {
    const app = createApp({ nodeEnv: "production" });

    const response = await request(app).get("/api/v1/openapi.json").expect(401);

    expect(response.body).toMatchObject({
      code: "unauthorized",
      message: "A bearer token is required.",
      reasonCode: "ERR_UNAUTHORIZED"
    });
  });

  it("rejects non-operator docs access in production", async () => {
    const app = createApp({ nodeEnv: "production" });

    const response = await request(app)
      .get("/api/v1/api-docs")
      .set("Authorization", "Bearer test:user-1:BUYER:MEMBER")
      .expect(403);

    expect(response.body).toMatchObject({
      code: "forbidden",
      reasonCode: "ERR_FORBIDDEN"
    });
  });

  it("allows operator docs access in production", async () => {
    const app = createApp({ nodeEnv: "production" });

    await request(app)
      .get("/api/v1/openapi.json")
      .set("Authorization", "Bearer test:operator-1:OPERATOR:MEMBER")
      .expect(200);
  });

  it("allows super users to access docs in production", async () => {
    const app = createApp({ nodeEnv: "production" });

    await request(app)
      .get("/api/v1/api-docs")
      .set("Authorization", "Bearer test:admin-1:BUYER:SUPER_USER")
      .expect(200);
  });
});
