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
});
