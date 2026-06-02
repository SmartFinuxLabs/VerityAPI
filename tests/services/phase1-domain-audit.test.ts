import { describe, expect, it, jest } from "@jest/globals";
import { createSupabasePhase1DomainService } from "../../src/services/phase1-domain.js";

const auth = {
  userId: "user-1",
  participantRole: "OPERATOR" as const,
  organizationRole: "SUPER_USER" as const
};

function createAuditClient(rpcData: unknown) {
  const rpc = jest.fn(async () => ({ data: rpcData, error: null }));
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

  return { service, rpc, auditInsert };
}

describe("phase1 domain onboarding audit events", () => {
  it("emits audit events for organization provisioning", async () => {
    const { service, auditInsert } = createAuditClient("org-1");

    await expect(
      service.provisionOrganization(auth, {
        legalName: "Buyer Inc",
        partyType: "BUYER",
        email: "buyer@example.com",
        fullName: "Buyer User",
        registrationNo: "REG-1"
      })
    ).resolves.toEqual({ organizationId: "org-1" });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "ORGANIZATION",
      aggregate_id: "org-1",
      event_type: "ORGANIZATION_PROVISIONED",
      actor_user_id: "user-1",
      payload: expect.objectContaining({
        partyType: "BUYER",
        email: "buyer@example.com"
      })
    }));
  });

  it("emits audit events for organization invitations", async () => {
    const { service, auditInsert } = createAuditClient("invitation-1");

    await expect(
      service.createOrganizationInvitation(auth, {
        sourceOrganizationId: "org-1",
        inviteeEmail: "supplier@example.com",
        invitationType: "SUPPLIER_ORG",
        targetPartyType: "SUPPLIER",
        targetOrgRole: "SUPER_USER",
        targetOrganizationId: "supplier-org-1",
        expiresAt: "2026-07-01T00:00:00.000Z"
      })
    ).resolves.toEqual({ invitationId: "invitation-1" });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "ORGANIZATION_INVITATION",
      aggregate_id: "invitation-1",
      event_type: "ORGANIZATION_INVITATION_CREATED",
      actor_user_id: "user-1",
      payload: expect.objectContaining({
        sourceOrganizationId: "org-1",
        inviteeEmail: "supplier@example.com",
        targetPartyType: "SUPPLIER"
      })
    }));
  });
});
