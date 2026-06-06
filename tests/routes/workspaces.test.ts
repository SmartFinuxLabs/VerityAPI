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
      getSupplierAnalytics: jest.fn(),
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

  it("returns supplier analytics from the configured service", async () => {
    const workspaceService: WorkspaceService = {
      getBuyerWorkspaceState: jest.fn(),
      getSupplierWorkspaceState: jest.fn(),
      getSupplierAnalytics: jest.fn(async () => ({
        volumeByStatus: [{ status: "ACCEPTED", count: 2, totalAmount: 42000 }],
        timeTrends: [{ period: "2026-05", createdVolume: 42000, settledVolume: 0 }],
        cashFlowProjections: [{ date: "2026-07-15", expectedAmount: 42000, factoredAmount: 9000 }],
        financialHealth: {
          disputeRatio: 0,
          onChainCreditScore: 835,
          totalOutstanding: 42000,
          totalFactored: 9000,
          liquidityRatio: 0.21
        },
        creditHistory: [{ period: "2026-05", score: 835 }]
      })),
      getInvestorWorkspaceState: jest.fn()
    };

    const response = await request(createWorkspaceTestApp(workspaceService))
      .get("/api/v1/workspaces/supplier/analytics")
      .expect(200);

    expect(workspaceService.getSupplierAnalytics).toHaveBeenCalledWith({
      userId: "user-1",
      participantRole: "BUYER",
      organizationRole: "MEMBER"
    });
    expect(response.body.data.financialHealth).toMatchObject({
      totalOutstanding: 42000,
      liquidityRatio: 0.21
    });
    expect(response.body.data.creditHistory).toEqual([{ period: "2026-05", score: 835 }]);
  });
});
