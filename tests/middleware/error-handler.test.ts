import express from "express";
import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { correlationId } from "../../src/middleware/correlation-id.js";
import { errorHandler, isJsonSyntaxError } from "../../src/middleware/error-handler.js";

describe("errorHandler middleware", () => {
  it("identifies Express JSON syntax errors", () => {
    const jsonError = new SyntaxError("Unexpected token") as SyntaxError & { body: string };
    jsonError.body = "{";

    expect(isJsonSyntaxError(jsonError)).toBe(true);
    expect(isJsonSyntaxError(new SyntaxError("plain"))).toBe(false);
    expect(isJsonSyntaxError(new Error("plain"))).toBe(false);
  });

  it("returns sanitized 500 errors without leaking dependency details", async () => {
    const app = express();
    app.use(correlationId);
    app.get("/explode", () => {
      throw new Error("database password=super-secret connection stack trace");
    });
    app.use(errorHandler);

    const response = await request(app).get("/explode").expect(500);

    expect(response.body).toMatchObject({
      code: "internal_server_error",
      message: "An unexpected server error occurred.",
      reasonCode: "ERR_INTERNAL_SERVER_ERROR",
      correlationId: expect.any(String)
    });
    expect(JSON.stringify(response.body)).not.toContain("super-secret");
    expect(JSON.stringify(response.body)).not.toContain("stack trace");
  });
});
