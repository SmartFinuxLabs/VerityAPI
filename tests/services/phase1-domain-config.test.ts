import { describe, expect, it, jest } from "@jest/globals";
import { createSupabasePhase1DomainService } from "../../src/services/phase1-domain.js";

const supplierAuth = {
  userId: "supplier-user-1",
  participantRole: "SUPPLIER" as const,
  organizationRole: "MEMBER" as const,
  accessToken: "supplier-access-token"
};

function singleRow(data: unknown) {
  return {
    select: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data, error: null }))
    }))
  };
}

describe("phase1 domain Supabase configuration", () => {
  it("uses anon key plus verified user token for domain writes when service role key is absent", async () => {
    const relationshipRead = {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({
            data: {
              id: "rel-1",
              buyer_id: "buyer-org-1",
              supplier_id: "supplier-org-1",
              status: "ACTIVE"
            },
            error: null
          }))
        }))
      }))
    };
    const invoiceInsert = jest.fn(() => singleRow({ id: "invoice-1", state: "SUBMITTED" }));
    const auditInsert = jest.fn(() => singleRow({ id: "audit-1" }));
    const client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === "relationships") return relationshipRead;
        if (table === "audit_events") return { insert: auditInsert };
        return { insert: invoiceInsert };
      })
    };
    const createClient = jest.fn(() => client);
    const service = createSupabasePhase1DomainService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      createClient
    });

    await expect(service.createInvoice(supplierAuth, {
      relationshipId: "rel-1",
      supplierId: "supplier-org-1",
      buyerId: "buyer-org-1",
      invoiceNumber: "INV-001",
      issueDate: "2026-06-02",
      dueDate: "2026-07-02",
      currency: "USDC",
      grossAmount: 1200,
      sourceSystemReference: "ui-invoice-1"
    })).resolves.toEqual({ id: "invoice-1", state: "SUBMITTED" });

    expect(createClient).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
      {
        global: {
          headers: {
            Authorization: "Bearer supplier-access-token"
          }
        }
      }
    );
    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      invoice_number: "INV-001",
      state: "SUBMITTED"
    }));
  });
});
