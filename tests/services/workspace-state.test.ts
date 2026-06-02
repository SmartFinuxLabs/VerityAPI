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
        buyer: "Northstar Buyer LLC",
        supplierName: "Acme Supplier Co",
        status: "PENDING",
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
});
