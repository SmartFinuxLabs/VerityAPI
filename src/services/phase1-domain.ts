import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { emitAuditEvent, queryAuditEvents as queryAuditEventRows, type AuditQuery } from "./audit-service.js";
import type { AuthContext } from "./auth-token.js";
import {
  badRequest,
  type BodyRecord,
  conflict,
  type SupabaseDomainClient,
  requireString,
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

type OnboardingPartyType = "BUYER" | "SUPPLIER" | "INVESTOR";
type InvitationType = "ORG_USER" | "SUPPLIER_ORG";
type OnboardingOrgRole = "SUPER_USER" | "MEMBER" | "VIEWER";

function requireOnboardingPartyType(body: BodyRecord, key: string): OnboardingPartyType {
  const value = requireString(body, key);
  if (value !== "BUYER" && value !== "SUPPLIER" && value !== "INVESTOR") {
    throw badRequest(`${key} must be BUYER, SUPPLIER, or INVESTOR for Phase 1 onboarding.`);
  }
  return value;
}

function requireInvitationType(body: BodyRecord): InvitationType {
  const value = requiredString(body, "invitationType") ?? "ORG_USER";
  if (value !== "ORG_USER" && value !== "SUPPLIER_ORG") {
    throw badRequest("invitationType must be ORG_USER or SUPPLIER_ORG.");
  }
  return value;
}

function requireOrganizationRole(body: BodyRecord, fallback: OnboardingOrgRole): OnboardingOrgRole {
  const value =
    requiredString(body, "organizationRole") ??
    requiredString(body, "orgRole") ??
    requiredString(body, "targetOrgRole") ??
    fallback;

  if (value !== "SUPER_USER" && value !== "MEMBER" && value !== "VIEWER") {
    throw badRequest("organizationRole must be SUPER_USER, MEMBER, or VIEWER.");
  }

  return value;
}

function mapOnboardingRpcError(operation: string, error?: { message?: string } | null): ApiError {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("duplicate") || message.includes("unique")) {
    return conflict("Organization already exists for this registration number or user.");
  }

  return new ApiError({
    statusCode: 500,
    code: "domain_operation_failed",
    message: `${operation} failed.`,
    reasonCode: "ERR_INTERNAL_SERVER_ERROR",
    details: error?.message
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
      const partyType = requireOnboardingPartyType(body, "partyType");
      const email = requireString(body, "email");
      const legalName = requiredString(body, "legalName") ?? requiredString(body, "entityName");
      const organizationIdResult = await client.rpc("provision_organization_with_super_user", {
        p_legal_name: requireString({ legalName }, "legalName"),
        p_party_type: partyType,
        p_user_id: auth.userId,
        p_email: email,
        p_full_name: requireString(body, "fullName"),
        p_registration_no: requireString(body, "registrationNo"),
        p_risk_profile: body.riskProfile ?? {}
      });

      if (organizationIdResult.error) {
        throw mapOnboardingRpcError("Provision organization", organizationIdResult.error);
      }

      const organizationId = (organizationIdResult.data ?? {}) as string;

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION",
        aggregateId: organizationId,
        eventType: "ORGANIZATION_PROVISIONED",
        payload: {
          partyType,
          email
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
      const organizationRole = requireOrganizationRole(body, "MEMBER");
      const membership = await unwrap(
        "Update membership role",
        updateRow(client, "party_memberships", membershipId, {
          org_role: organizationRole,
          updated_at: new Date().toISOString()
        })
      );

      await emitAuditEvent(client, auth, {
        aggregateType: "PARTY_MEMBERSHIP",
        aggregateId: membershipId,
        eventType: "MEMBERSHIP_ROLE_UPDATED",
        payload: {
          organizationRole
        }
      });

      return membership;
    },

    async createOrganizationInvitation(auth, body) {
      const client = getClient();
      const invitationType = requireInvitationType(body);
      const targetPartyType = requireOnboardingPartyType(body, "targetPartyType");
      const targetOrgRole = requireOrganizationRole(
        body,
        invitationType === "SUPPLIER_ORG" ? "SUPER_USER" : "MEMBER"
      );

      if (invitationType === "SUPPLIER_ORG" && (targetPartyType !== "SUPPLIER" || targetOrgRole !== "SUPER_USER")) {
        throw badRequest("SUPPLIER_ORG invitations must target SUPPLIER with SUPER_USER role.");
      }

      if (invitationType === "ORG_USER") {
        requireString(body, "targetOrganizationId");
      }

      const invitationId = (await unwrap(
        "Create organization invitation",
        client.rpc("create_organization_invitation", {
          p_source_organization_id: requireString(body, "sourceOrganizationId"),
          p_invitee_email: requireString(body, "inviteeEmail"),
          p_invitation_type: invitationType,
          p_target_party_type: targetPartyType,
          p_target_org_role: targetOrgRole,
          p_target_organization_id: requiredString(body, "targetOrganizationId"),
          p_expires_at: requireString(body, "expiresAt")
        })
      )) as string;

      await emitAuditEvent(client, auth, {
        aggregateType: "ORGANIZATION_INVITATION",
        aggregateId: invitationId,
        eventType: "ORGANIZATION_INVITATION_CREATED",
        payload: {
          sourceOrganizationId: requireString(body, "sourceOrganizationId"),
          inviteeEmail: requireString(body, "inviteeEmail"),
          targetPartyType
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
          p_full_name: requireString(body, "fullName"),
          p_legal_name: requireString(body, "legalName"),
          p_registration_no: requireString(body, "registrationNo"),
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
