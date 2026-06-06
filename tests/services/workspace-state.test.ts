import { describe, expect, it, jest } from "@jest/globals";
import { createSupabaseWorkspaceService, type SupabaseWorkspaceClient } from "../../src/services/workspace-state.js";

function queryResult(data: unknown[]) {
  return Promise.resolve({ data, error: null });
}

function queryError(message: string) {
  return Promise.resolve({ data: null, error: { message } });
}

describe("Supabase workspace state service", () => {
  it("maps workspace invoice legal names and high-fidelity detail defaults", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "supplier-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "invoice-1",
          invoice_number: "INV-001",
          relationship_id: "rel-1",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "1200.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-02",
          due_date: "2026-07-02",
          source_system_reference: "ERP-INV-001",
          metadata: {},
          buyer: { legal_name: "Northstar Buyer LLC" },
          supplier: { legal_name: "Acme Supplier Co" }
        }
      ])
    );
    const organizationsOrder = jest.fn(() => queryResult([]));

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: organizationsOrder
                }))
              }))
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getSupplierWorkspaceState({
      userId: "supplier-user-1",
      participantRole: "SUPPLIER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "invoice-1",
        invoiceNumber: "INV-001",
        buyer: "Northstar Buyer LLC",
        supplierName: "Acme Supplier Co",
        status: "PENDING",
        issueDate: "2026-06-02",
        dueDate: "2026-07-02",
        maturityDate: "2026-07-02",
        poNumber: "PO-INV-001",
        goodsReceiptNumber: "GR-INV-001",
        walletAddress: "supplier-org-1",
        lineItems: expect.arrayContaining([
          expect.objectContaining({
            description: "Invoice INV-001",
            qty: 1,
            total: 1200
          })
        ]),
        validations: expect.arrayContaining([
          expect.objectContaining({
            key: "invoice-format",
            status: "passed"
          })
        ])
      })
    ]);
    expect(state.supplierOrganizationId).toBe("supplier-org-1");
  });

  it("returns active registered buyers in supplier workspace state", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "supplier-org-1" }]));
    const invoicesOrder = jest.fn(() => queryResult([]));
    const organizationsOrder = jest.fn(() =>
      queryResult([
        {
          id: "buyer-org-1",
          legal_name: "Northstar Buyer LLC",
          status: "ACTIVE"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: organizationsOrder
                }))
              }))
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getSupplierWorkspaceState({
      userId: "supplier-user-1",
      participantRole: "SUPPLIER",
      organizationRole: "SUPER_USER"
    });

    expect(state).toMatchObject({
      supplierOrganizationId: "supplier-org-1",
      invoices: [],
      registeredBuyers: [
        {
          buyerId: "buyer-org-1",
          buyerName: "Northstar Buyer LLC",
          buyerStatus: "ACTIVE"
        }
      ]
    });
    expect(client.from).toHaveBeenCalledWith("organizations");
    expect(organizationsOrder).toHaveBeenCalledWith("legal_name", { ascending: true });
  });

  it("maps buyer workspace invoices with supplier legal names and invoice numbers", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-1",
          invoice_number: "INV-BUYER-API-001",
          relationship_id: "rel-1",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "24000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-02",
          due_date: "2026-07-02",
          metadata: {},
          buyer: { legal_name: "Acme Buyer LLC" },
          supplier: { legal_name: "Northstar Supplier LLC" }
        }
      ])
    );
    const supplierNamesOrder = jest.fn(() =>
      queryResult([
        {
          id: "supplier-org-1",
          legal_name: "Northstar Supplier LLC"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: jest.fn((_column: string, ids: unknown[]) => {
                expect(ids).toEqual(["supplier-org-1"]);
                return {
                  order: supplierNamesOrder
                };
              })
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-1",
        invoiceNumber: "INV-BUYER-API-001",
        supplierName: "Northstar Supplier LLC",
        supplierId: "supplier-org-1",
        status: "PENDING_VERIFICATION",
        issueDate: "2026-06-02",
        dueDate: "2026-07-02",
        maturityDate: "2026-07-02",
      })
    ]);
  });

  it("prefers joined supplier legal names over id-like metadata supplier names for buyer workspace invoices", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-id-like-supplier",
          invoice_number: "INV-BUYER-API-003",
          relationship_id: "rel-3",
          supplier_id: "supplier-org-3",
          buyer_id: "buyer-org-1",
          gross_amount: "24000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-02",
          due_date: "2026-07-02",
          metadata: {
            supplierName: "supplier-org-3"
          },
          buyer: { legal_name: "Acme Buyer LLC" },
          supplier: { legal_name: "Resolved Supplier Legal LLC" }
        }
      ])
    );
    const supplierNamesOrder = jest.fn(() =>
      queryResult([
        {
          id: "supplier-org-3",
          legal_name: "Resolved Supplier Legal LLC"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: jest.fn((_column: string, ids: unknown[]) => {
                expect(ids).toEqual(["supplier-org-3"]);
                return {
                  order: supplierNamesOrder
                };
              })
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-id-like-supplier",
        invoiceNumber: "INV-BUYER-API-003",
        supplierId: "supplier-org-3",
        supplierName: "Resolved Supplier Legal LLC"
      })
    ]);
  });

  it("prefers joined supplier legal names over placeholder metadata supplier names for buyer workspace invoices", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-placeholder-supplier",
          invoice_number: "INV-BUYER-API-004",
          relationship_id: "rel-4",
          supplier_id: "supplier-org-4",
          buyer_id: "buyer-org-1",
          gross_amount: "24000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-02",
          due_date: "2026-07-02",
          metadata: {
            supplierName: "Supplier name unavailable"
          },
          buyer: { legal_name: "Acme Buyer LLC" },
          supplier: { legal_name: "Placeholder Resolved Supplier LLC" }
        }
      ])
    );
    const supplierNamesOrder = jest.fn(() =>
      queryResult([
        {
          id: "supplier-org-4",
          legal_name: "Placeholder Resolved Supplier LLC"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: jest.fn((_column: string, ids: unknown[]) => {
                expect(ids).toEqual(["supplier-org-4"]);
                return {
                  order: supplierNamesOrder
                };
              })
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-placeholder-supplier",
        invoiceNumber: "INV-BUYER-API-004",
        supplierId: "supplier-org-4",
        supplierName: "Placeholder Resolved Supplier LLC"
      })
    ]);
  });

  it("retrieves buyer invoice supplier names from supplier ids when invoice rows omit joined supplier details", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-2",
          invoice_number: "INV-BUYER-API-002",
          relationship_id: "rel-2",
          supplier_id: "supplier-org-2",
          buyer_id: "buyer-org-1",
          gross_amount: "31000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-04",
          due_date: "2026-07-04",
          metadata: {},
          buyer: { legal_name: "Acme Buyer LLC" }
        }
      ])
    );
    const supplierNamesOrder = jest.fn(() =>
      queryResult([
        {
          id: "supplier-org-2",
          legal_name: "Resolved Supplier Name LLC"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: jest.fn((_column: string, ids: unknown[]) => {
                expect(ids).toEqual(["supplier-org-2"]);
                return {
                  order: supplierNamesOrder
                };
              })
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-2",
        invoiceNumber: "INV-BUYER-API-002",
        supplierId: "supplier-org-2",
        supplierName: "Resolved Supplier Name LLC"
      })
    ]);
    expect(supplierNamesOrder).toHaveBeenCalledWith("legal_name", { ascending: true });
  });

  it("retrieves buyer invoice supplier names from supplier ids when rows contain placeholder supplier names", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-placeholder-fallback",
          invoice_number: "INV-BUYER-API-005",
          relationship_id: "rel-5",
          supplier_id: "supplier-org-5",
          buyer_id: "buyer-org-1",
          gross_amount: "31000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-04",
          due_date: "2026-07-04",
          metadata: {
            supplierName: "Supplier name unavailable"
          },
          buyer: { legal_name: "Acme Buyer LLC" }
        }
      ])
    );
    const supplierNamesOrder = jest.fn(() =>
      queryResult([
        {
          id: "supplier-org-5",
          legal_name: "Fallback Supplier Name LLC"
        }
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              in: jest.fn((_column: string, ids: unknown[]) => {
                expect(ids).toEqual(["supplier-org-5"]);
                return {
                  order: supplierNamesOrder
                };
              })
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-placeholder-fallback",
        supplierId: "supplier-org-5",
        supplierName: "Fallback Supplier Name LLC"
      })
    ]);
    expect(supplierNamesOrder).toHaveBeenCalledWith("legal_name", { ascending: true });
  });

  it("uses invoice metadata supplier name as the authoritative buyer invoice supplier name", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "buyer-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "uuid-buyer-invoice-authoritative-supplier",
          invoice_number: "INV-BUYER-API-006",
          relationship_id: "rel-6",
          supplier_id: "supplier-org-6",
          buyer_id: "buyer-org-1",
          gross_amount: "31000.00",
          accepted_amount: null,
          currency: "USDC",
          state: "SUBMITTED",
          issue_date: "2026-06-04",
          due_date: "2026-07-04",
          metadata: {
            supplierName: "Client Supplied Supplier Name"
          },
          buyer: { legal_name: "Acme Buyer LLC" },
          supplier: { legal_name: "Joined Supplier Alias LLC" }
        }
      ])
    );
    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const state = await service.getBuyerWorkspaceState({
      userId: "buyer-user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    });

    expect(state.invoices).toEqual([
      expect.objectContaining({
        id: "uuid-buyer-invoice-authoritative-supplier",
        supplierId: "supplier-org-6",
        supplierName: "Client Supplied Supplier Name"
      })
    ]);
  });

  it("fails supplier workspace state when registered buyer directory lookup fails", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "supplier-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "invoice-1",
          invoice_number: "INV-001",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "1200.00",
          state: "SUBMITTED"
        }
      ])
    );
    const organizationsOrder = jest.fn(() => queryError("RLS denied"));

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: organizationsOrder
                }))
              }))
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    await expect(
      service.getSupplierWorkspaceState({
        userId: "supplier-user-1",
        accessToken: "supplier-token",
        participantRole: "SUPPLIER",
        organizationRole: "SUPER_USER"
      })
    ).rejects.toMatchObject({
      code: "workspace_query_failed",
      message: "Read registered buyers failed."
    });
    expect(organizationsOrder).toHaveBeenCalledWith("legal_name", { ascending: true });
  });

  it("aggregates supplier analytics for status volume, cash flow, trends, and credit history", async () => {
    const partyMembershipsOrder = jest.fn(() => queryResult([{ organization_id: "supplier-org-1" }]));
    const invoicesOrder = jest.fn(() =>
      queryResult([
        {
          id: "invoice-accepted",
          invoice_number: "INV-100",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "42000.00",
          accepted_amount: "42000.00",
          state: "ACCEPTED",
          issue_date: "2026-05-02",
          due_date: "2026-07-15",
          metadata: {},
        },
        {
          id: "invoice-factored",
          invoice_number: "INV-101",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "9000.00",
          accepted_amount: "9000.00",
          state: "FACTORED",
          issue_date: "2026-05-08",
          due_date: "2026-07-15",
          metadata: {},
        },
        {
          id: "invoice-settled",
          invoice_number: "INV-102",
          supplier_id: "supplier-org-1",
          buyer_id: "buyer-org-1",
          gross_amount: "18000.00",
          accepted_amount: "18000.00",
          state: "SETTLED",
          issue_date: "2026-04-14",
          due_date: "2026-05-14",
          metadata: {},
        },
      ])
    );

    const client = {
      from: jest.fn((table: string) => {
        if (table === "party_memberships") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: partyMembershipsOrder
                }))
              }))
            }))
          };
        }

        if (table === "invoices") {
          return {
            select: jest.fn(() => ({
              in: jest.fn(() => ({
                order: invoicesOrder
              }))
            }))
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    } as unknown as SupabaseWorkspaceClient;

    const service = createSupabaseWorkspaceService({
      url: "https://supabase.test",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    const analytics = await service.getSupplierAnalytics({
      userId: "supplier-user-1",
      accessToken: "supplier-token",
      participantRole: "SUPPLIER",
      organizationRole: "SUPER_USER"
    });

    expect(analytics.volumeByStatus).toEqual(
      expect.arrayContaining([
        { status: "ACCEPTED", count: 1, totalAmount: 42000 },
        { status: "FACTORED", count: 1, totalAmount: 9000 },
        { status: "SETTLED", count: 1, totalAmount: 18000 },
      ])
    );
    expect(analytics.timeTrends).toEqual([
      { period: "2026-04", createdVolume: 18000, settledVolume: 18000 },
      { period: "2026-05", createdVolume: 51000, settledVolume: 0 },
    ]);
    expect(analytics.cashFlowProjections).toEqual([
      { date: "2026-07-15", expectedAmount: 42000, factoredAmount: 9000 },
    ]);
    expect(analytics.financialHealth).toMatchObject({
      totalOutstanding: 51000,
      totalFactored: 9000,
      liquidityRatio: 0.18,
      disputeRatio: 0,
      onChainCreditScore: 610,
    });
    expect(analytics.creditHistory).toEqual([
      { period: "2026-04", score: 610 },
      { period: "2026-05", score: 610 },
    ]);
  });
});
