import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createSupabasePhase1DomainService } from "../../src/services/phase1-domain.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "BUYER",
  organizationRole: "MEMBER"
};

function createInsertClient(data: unknown = { id: "rel-1" }) {
  const maybeSingle = jest.fn(async () => ({ data, error: null }));
  const select = jest.fn(() => ({ maybeSingle }));
  const insert = jest.fn(() => ({ select }));
  const update = jest.fn(() => ({
    eq: jest.fn(() => ({ select }))
  }));
  const from = jest.fn(() => ({ insert, update }));
  const client = { rpc: jest.fn(), from };

  return { client, insert, update };
}

function createService(client: ReturnType<typeof createInsertClient>["client"]) {
  return createSupabasePhase1DomainService({
    url: "https://supabase.test",
    serviceRoleKey: "service-role-key",
    createClient: jest.fn(() => client)
  });
}

describe("Phase 1 domain service", () => {
  describe("relationship invoice mode configuration", () => {
    it("creates relationships with validated invoice mode configuration", async () => {
      const { client, insert } = createInsertClient({
        id: "rel-1",
        invoice_mode: "SUPPLIER_ISSUED"
      });
      const service = createService(client);

      await expect(
        service.createRelationship(auth, {
          buyerId: "buyer-org-1",
          supplierId: "supplier-org-1",
          invoiceMode: "SUPPLIER_ISSUED",
          paymentMode: "USDC",
          sourceSystemReference: "erp-relationship-1"
        })
      ).resolves.toEqual({
        id: "rel-1",
        invoice_mode: "SUPPLIER_ISSUED"
      });

      expect(client.from).toHaveBeenCalledWith("relationships");
      expect(insert).toHaveBeenCalledWith({
        buyer_id: "buyer-org-1",
        supplier_id: "supplier-org-1",
        invoice_mode: "SUPPLIER_ISSUED",
        payment_mode: "USDC",
        source_system_reference: "erp-relationship-1",
        created_by: "user-1",
        updated_by: "user-1"
      });
    });

    it("rejects missing required relationship fields before persistence", async () => {
      const { client, insert } = createInsertClient();
      const service = createService(client);

      await expect(
        service.createRelationship(auth, {
          buyerId: "buyer-org-1",
          invoiceMode: "SUPPLIER_ISSUED"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it("rejects invalid relationship invoice modes before persistence", async () => {
      const { client, insert } = createInsertClient();
      const service = createService(client);

      await expect(
        service.createRelationship(auth, {
          buyerId: "buyer-org-1",
          supplierId: "supplier-org-1",
          invoiceMode: "UNKNOWN_MODE"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "invalid_relationship_mode",
        reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it("rejects relationships where buyer and supplier are the same organization", async () => {
      const { client, insert } = createInsertClient();
      const service = createService(client);

      await expect(
        service.createRelationship(auth, {
          buyerId: "same-org",
          supplierId: "same-org",
          invoiceMode: "SELF_BILLED"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it("rejects invalid invoice mode updates before persistence", async () => {
      const { client, update } = createInsertClient();
      const service = createService(client);

      await expect(
        service.updateRelationshipInvoiceMode(auth, "rel-1", {
          invoiceMode: "BAD_MODE"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "invalid_relationship_mode",
        reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
      });
      expect(update).not.toHaveBeenCalled();
    });
  });
});
