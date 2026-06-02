import { describe, expect, it, jest } from "@jest/globals";
import { createSupabasePhase1DomainService } from "../../src/services/phase1-domain.js";

const buyerAuth = {
  userId: "buyer-user-1",
  participantRole: "BUYER" as const,
  organizationRole: "SUPER_USER" as const
};

function createRpcClient(rpcData: unknown = "result-1", rpcError: unknown = null) {
  const rpc = jest.fn(async () => ({ data: rpcData, error: rpcError }));
  const auditMaybeSingle = jest.fn(async () => ({ data: { id: "audit-1" }, error: null }));
  const auditSelect = jest.fn(() => ({ maybeSingle: auditMaybeSingle }));
  const auditInsert = jest.fn(() => ({ select: auditSelect }));
  const from = jest.fn((table: string) => {
    if (table === "audit_events") {
      return { insert: auditInsert };
    }
    return {};
  });
  const client = { rpc, from };
  const service = createSupabasePhase1DomainService({
    url: "http://supabase.local",
    serviceRoleKey: "service-role",
    createClient: () => client
  });

  return { service, rpc, from };
}

describe("phase1 domain onboarding guards", () => {
  it("provisions buyer, supplier, and investor organizations with normalized RPC payloads", async () => {
    const { service, rpc } = createRpcClient("buyer-org-1");

    await expect(service.provisionOrganization(buyerAuth, {
      legalName: "Buyer Inc",
      partyType: "BUYER",
      email: "buyer@test.local",
      fullName: "Buyer User",
      registrationNo: "REG-1",
      riskProfile: { creditLimit: 100000 }
    })).resolves.toEqual({ organizationId: "buyer-org-1" });

    expect(rpc).toHaveBeenCalledWith("provision_organization_with_super_user", {
      p_legal_name: "Buyer Inc",
      p_party_type: "BUYER",
      p_user_id: "buyer-user-1",
      p_email: "buyer@test.local",
      p_full_name: "Buyer User",
      p_registration_no: "REG-1",
      p_risk_profile: { creditLimit: 100000 }
    });
  });

  it("rejects multi-role or unsupported organization party types before Supabase RPCs", async () => {
    const { service, rpc } = createRpcClient();

    await expect(service.provisionOrganization(buyerAuth, {
      legalName: "Hybrid Co",
      partyType: "BUYER,SUPPLIER",
      email: "hybrid@test.local",
      fullName: "Hybrid User",
      registrationNo: "HYB-1"
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
      message: "partyType must be BUYER, SUPPLIER, or INVESTOR for Phase 1 onboarding."
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps duplicate organization Supabase errors to stable conflict responses", async () => {
    const { service } = createRpcClient(null, { message: "duplicate registration_no violates unique constraint" });

    await expect(service.provisionOrganization(buyerAuth, {
      legalName: "Buyer Inc",
      partyType: "BUYER",
      email: "buyer@test.local",
      fullName: "Buyer User",
      registrationNo: "REG-1"
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "invalid_invoice_state",
      reasonCode: "ERR_CONFLICT",
      message: "Organization already exists for this registration number or user."
    });
  });

  it("validates organization invitation type, target party, and target role before Supabase RPCs", async () => {
    const { service, rpc } = createRpcClient();

    await expect(service.createOrganizationInvitation(buyerAuth, {
      sourceOrganizationId: "buyer-org-1",
      inviteeEmail: "supplier@test.local",
      invitationType: "SUPPLIER_ORG",
      targetPartyType: "BUYER",
      targetOrgRole: "MEMBER",
      expiresAt: "2026-07-01T00:00:00.000Z"
    })).rejects.toMatchObject({
      statusCode: 400,
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
      message: "SUPPLIER_ORG invitations must target SUPPLIER with SUPER_USER role."
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts supplier organization invitations with supplier activation details", async () => {
    const { service, rpc } = createRpcClient("supplier-org-1");

    await expect(service.acceptOrganizationInvitation(buyerAuth, "token-1", {
      fullName: "Supplier User",
      legalName: "Supplier LLC",
      registrationNo: "SUP-1",
      riskProfile: { recourse: "FULL" }
    })).resolves.toEqual({ organizationId: "supplier-org-1" });

    expect(rpc).toHaveBeenCalledWith("accept_organization_invitation", {
      p_invitation_token: "token-1",
      p_user_id: "buyer-user-1",
      p_full_name: "Supplier User",
      p_legal_name: "Supplier LLC",
      p_registration_no: "SUP-1",
      p_risk_profile: { recourse: "FULL" }
    });
  });
});
