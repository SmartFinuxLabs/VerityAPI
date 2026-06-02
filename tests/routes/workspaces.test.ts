import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createWorkspacesRouter, type WorkspaceService } from "../../src/routes/workspaces.js";

function createWorkspaceTestApp(service: WorkspaceService) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.auth = {
      userId: "user-1",
      participantRole: "BUYER",
      organizationRole: "MEMBER"
    };
    next();
  });
  app.use("/api/v1", createWorkspacesRouter(service));
  app.use(errorHandler);
  return app;
}

describe("workspace routes", () => {
  it("returns buyer workspace state from the configured service", async () => {
    const workspaceService: WorkspaceService = {
      getBuyerWorkspaceState: jest.fn(async () => ({
        invoices: [{ id: "API-BUYER-001" }],
        fundingRequests: [],
        liquidity: {
          availableLiquidity: 1000,
          walletAddress: "0xapi",
          walletName: "VerityAPI",
          isConnected: true
        }
      })),
      getSupplierWorkspaceState: jest.fn(),
      getInvestorWorkspaceState: jest.fn()
    };

    const response = await request(createWorkspaceTestApp(workspaceService))
      .get("/api/v1/workspaces/buyer")
      .expect(200);

    expect(workspaceService.getBuyerWorkspaceState).toHaveBeenCalledWith({
      userId: "user-1",
      participantRole: "BUYER",
      organizationRole: "MEMBER"
    });
    expect(response.body).toEqual({
      data: {
        invoices: [{ id: "API-BUYER-001" }],
        fundingRequests: [],
        liquidity: {
          availableLiquidity: 1000,
          walletAddress: "0xapi",
          walletName: "VerityAPI",
          isConnected: true
        }
      }
    });
  });
});
