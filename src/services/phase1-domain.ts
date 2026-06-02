import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { emitAuditEvent, queryAuditEvents as queryAuditEventRows, type AuditQuery } from "./audit-service.js";
import type { AuthContext } from "./auth-token.js";
import {
  type BodyRecord,
  type SupabaseDomainClient,
  requiredString,
  unwrap,
  updateRow
} from "./domain-service-utils.js";
import { createFundingService, type FundingService } from "./funding-service.js";
import { createInvoiceService, type InvoiceService } from "./invoice-service.js";
import { createRelationshipService, type RelationshipService } from "./relationship-service.js";
import { createArcSettlementAdapter, createSettlementService, type SettlementService } from "./settlement-service.js";

export interface Phase1DomainService extends RelationshipService, InvoiceService, FundingService, SettlementService {
  provisionOrganization(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  listMemberships(auth: AuthContext, organizationId: string): Promise<unknown>;
  updateMembershipRole(auth: AuthContext, membershipId: string, body: BodyRecord): Promise<unknown>;
  createOrganizationInvitation(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  acceptOrganizationInvitation(auth: AuthContext, invitationToken: string, body: BodyRecord): Promise<unknown>;
  revokeOrganizationInvitation(auth: AuthContext, invitationId: string): Promise<unknown>;
  queryAuditEvents(auth: AuthContext, query?: AuditQuery): Promise<unknown>;
}

interface Phase1DomainServiceOptions {
  url?: string;
  serviceRoleKey?: string;
  createClient?: (url: string, key: string) => SupabaseDomainClient;
}

function notConfigured(): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "supabase_not_configured",
    message: "Supabase domain operations are not configured for VerityAPI.",
    reasonCode: "ERR_INTERNAL_SERVER_ERROR"
  });
}

export function createSupabasePhase1DomainService(options: Phase1DomainServiceOptions): Phase1DomainService {
  const createClient =
    options.createClient ??
    ((url, key) => createSupabaseClient(url, key) as unknown as SupabaseDomainClient);

  function getClient(): SupabaseDomainClient {
    if (!options.url || !options.serviceRoleKey) {
      throw notConfigured();
    }

    return createClient(options.url, options.serviceRoleKey);
  }

  const relationshipService = createRelationshipService(getClient, { auditEvents: true });
  const invoiceService = createInvoiceService(getClient, { auditEvents: true });
  const fundingService = createFundingService(getClient, { auditEvents: true });
  const settlementService = createSettlementService(getClient, {
    adapter: createArcSettlementAdapter(),
    auditEvents: true
  });

  return {
    ...relationshipService,
    ...invoiceService,
    ...fundingService,
    ...settlementService,

    async provisionOrganization(auth, body) {
      const client = getClient();
      const organizationId = (await unwrap(
        "Provision organization",
        client.rpc("provision_organization_with_super_user", {
          p_legal_name: requiredString(body, "legalName") ?? requiredString(body, "entityName"),
          p_party_type: requiredString(body, "partyType") ?? auth.participantRole,
          p_user_id: auth.userId,
          p_email: requiredString(body, "email"),
          p_full_name: requiredString(body, "fullName"),
          p_registration_no: requiredString(body, "registrationNo"),
          p_risk_profile: body.riskProfile ?? {}
        })
      )) as string;

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION",
        aggregateId: organizationId,
        eventType: "ORGANIZATION_PROVISIONED",
        payload: {
          partyType: requiredString(body, "partyType") ?? auth.participantRole,
          email: requiredString(body, "email")
        }
      });

      return { organizationId };
    },

    listMemberships(_auth, organizationId) {
      return unwrap(
        "List organization memberships",
        getClient()
          .from("party_memberships")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
      );
    },

    async updateMembershipRole(auth, membershipId, body) {
      const client = getClient();
      const membership = await unwrap(
        "Update membership role",
        updateRow(client, "party_memberships", membershipId, {
          org_role: requiredString(body, "organizationRole") ?? requiredString(body, "orgRole"),
          updated_at: new Date().toISOString()
        })
      );

      await emitAuditEvent(client, auth, {
        aggregateType: "PARTY_MEMBERSHIP",
        aggregateId: membershipId,
        eventType: "MEMBERSHIP_ROLE_UPDATED",
        payload: {
          organizationRole: requiredString(body, "organizationRole") ?? requiredString(body, "orgRole")
        }
      });

      return membership;
    },

    async createOrganizationInvitation(auth, body) {
      const client = getClient();
      const invitationId = (await unwrap(
        "Create organization invitation",
        client.rpc("create_organization_invitation", {
          p_source_organization_id: requiredString(body, "sourceOrganizationId"),
          p_invitee_email: requiredString(body, "inviteeEmail"),
          p_invitation_type: requiredString(body, "invitationType") ?? "ORG_USER",
          p_target_party_type: requiredString(body, "targetPartyType"),
          p_target_org_role: requiredString(body, "targetOrgRole") ?? "MEMBER",
          p_target_organization_id: requiredString(body, "targetOrganizationId"),
          p_expires_at: requiredString(body, "expiresAt")
        })
      )) as string;

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION_INVITATION",
        aggregateId: invitationId,
        eventType: "ORGANIZATION_INVITATION_CREATED",
        payload: {
          sourceOrganizationId: requiredString(body, "sourceOrganizationId"),
          inviteeEmail: requiredString(body, "inviteeEmail"),
          targetPartyType: requiredString(body, "targetPartyType")
        }
      });

      return { invitationId };
    },

    async acceptOrganizationInvitation(auth, invitationToken, body) {
      const client = getClient();
      const organizationId = (await unwrap(
        "Accept organization invitation",
        client.rpc("accept_organization_invitation", {
          p_invitation_token: invitationToken,
          p_user_id: auth.userId,
          p_full_name: requiredString(body, "fullName"),
          p_legal_name: requiredString(body, "legalName"),
          p_registration_no: requiredString(body, "registrationNo"),
          p_risk_profile: body.riskProfile ?? {}
        })
      )) as string;

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION",
        aggregateId: organizationId,
        eventType: "ORGANIZATION_INVITATION_ACCEPTED",
        payload: {
          invitationToken,
          email: requiredString(body, "email") ?? null
        }
      });

      return { organizationId };
    },

    async revokeOrganizationInvitation(auth, invitationId) {
      const client = getClient();
      const invitation = await unwrap(
        "Revoke organization invitation",
        updateRow(client, "organization_invitations", invitationId, {
          status: "REVOKED",
          revoked_by_user_id: auth.userId,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      );

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION_INVITATION",
        aggregateId: invitationId,
        eventType: "ORGANIZATION_INVITATION_REVOKED",
        payload: {
          status: "REVOKED"
        }
      });

      return invitation;
    },

    queryAuditEvents(_auth, query) {
      return queryAuditEventRows(getClient(), query);
    }
  };
}

export const supabasePhase1DomainService = createSupabasePhase1DomainService({
  url: env.supabase.url,
  serviceRoleKey: env.supabase.serviceRoleKey
});
