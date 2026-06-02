import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "../errors/api-error.js";
import { env } from "../config/env.js";
import type { AuthContext, OrganizationRole, ParticipantRole } from "./auth-token.js";

export interface ApiAuthSession {
  user: {
    id: string;
    email?: string;
    userMetadata?: Record<string, unknown>;
  };
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface RoleHint {
  participantRole?: string;
  organizationRole?: string;
  organizationName?: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  entityName: string;
  participantRole: string;
  partyType: string;
  invitationToken?: string;
}

export interface AuthService {
  getRoleHint(email: string): Promise<RoleHint | undefined>;
  signIn(payload: SignInPayload): Promise<{ session: ApiAuthSession }>;
  register(payload: RegisterPayload): Promise<{
    session?: ApiAuthSession;
    confirmationRequired: boolean;
  }>;
  verifyAccessToken(token: string): Promise<AuthContext>;
}

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: SupabaseUser;
}

interface SupabaseAuthError {
  message?: string;
}

export interface SupabaseAuthClient {
  auth: {
    signInWithPassword(payload: SignInPayload): Promise<{
      data?: { session?: SupabaseSession | null };
      error?: SupabaseAuthError | null;
    }>;
    signUp(payload: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<{
      data?: { session?: SupabaseSession | null; user?: SupabaseUser | null };
      error?: SupabaseAuthError | null;
    }>;
    getUser(token: string): Promise<{
      data?: { user?: SupabaseUser | null };
      error?: SupabaseAuthError | null;
    }>;
  };
  rpc(
    functionName: string,
    params?: Record<string, unknown>
  ): Promise<{ data?: unknown; error?: SupabaseAuthError | null }>;
  from(table: string): unknown;
}

export type SupabaseClientFactory = (url: string, key: string) => SupabaseAuthClient;

interface SupabaseAuthServiceOptions {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  createClient?: SupabaseClientFactory;
}

function notConfigured(): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "supabase_not_configured",
    message: "Supabase authentication is not configured for VerityAPI.",
    reasonCode: "ERR_INTERNAL_SERVER_ERROR"
  });
}

function authFailure(message = "Authentication failed."): ApiError {
  return new ApiError({
    statusCode: 401,
    code: "auth_failure",
    message,
    reasonCode: "AUTH_FAILURE"
  });
}

function normalizeParticipantRole(value: unknown): ParticipantRole | undefined {
  if (value === "SUPPLIER" || value === "BUYER" || value === "INVESTOR" || value === "OPERATOR") {
    return value;
  }

  if (value === "Supplier") return "SUPPLIER";
  if (value === "Buyer") return "BUYER";
  if (value === "Investor") return "INVESTOR";
  if (value === "Operator") return "OPERATOR";

  return undefined;
}

function normalizeOrganizationRole(value: unknown): OrganizationRole | undefined {
  if (value === "SUPER_USER" || value === "MEMBER" || value === "VIEWER") {
    return value;
  }

  return undefined;
}

function normalizeRoleHint(value: unknown): RoleHint | undefined {
  const source = Array.isArray(value) ? value[0] : value;

  if (!source || typeof source !== "object") {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  return {
    participantRole:
      typeof record.participantRole === "string"
        ? record.participantRole
        : typeof record.participant_role === "string"
          ? record.participant_role
          : undefined,
    organizationRole:
      typeof record.organizationRole === "string"
        ? record.organizationRole
        : typeof record.organization_role === "string"
          ? record.organization_role
          : undefined,
    organizationName:
      typeof record.organizationName === "string"
        ? record.organizationName
        : typeof record.organization_name === "string"
          ? record.organization_name
          : undefined
  };
}

function mapSession(session: SupabaseSession | null | undefined): ApiAuthSession | undefined {
  if (!session?.access_token || !session.user?.id) {
    return undefined;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      userMetadata: session.user.user_metadata
    },
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:
      typeof session.expires_at === "number"
        ? new Date(session.expires_at * 1000).toISOString()
        : undefined
  };
}

export function createSupabaseAuthService(options: SupabaseAuthServiceOptions): AuthService {
  const createClient =
    options.createClient ?? ((url, key) => createSupabaseClient(url, key) as unknown as SupabaseAuthClient);

  function getClient(key?: string): SupabaseAuthClient {
    if (!options.url || !key) {
      throw notConfigured();
    }

    return createClient(options.url, key);
  }

  return {
    async getRoleHint(email: string) {
      const client = getClient(options.serviceRoleKey ?? options.anonKey);
      const { data, error } = await client.rpc("get_signin_role_hint", { p_email: email });

      if (error) {
        throw new ApiError({
          statusCode: 500,
          code: "role_hint_lookup_failed",
          message: "Unable to resolve role hint.",
          reasonCode: "ERR_INTERNAL_SERVER_ERROR"
        });
      }

      return normalizeRoleHint(data);
    },

    async signIn(payload: SignInPayload) {
      const client = getClient(options.anonKey);
      const { data, error } = await client.auth.signInWithPassword(payload);

      if (error) {
        throw authFailure(error.message);
      }

      const session = mapSession(data?.session);
      if (!session) {
        throw authFailure("Supabase did not return an authenticated session.");
      }

      return { session };
    },

    async register(payload: RegisterPayload) {
      const client = getClient(options.anonKey);
      const metadata: Record<string, unknown> = {
        fullName: payload.fullName,
        entityName: payload.entityName,
        participantRole: payload.participantRole,
        partyType: payload.partyType
      };

      if (payload.invitationToken) {
        metadata.invitationToken = payload.invitationToken;
      }

      const { data, error } = await client.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: { data: metadata }
      });

      if (error) {
        throw authFailure(error.message);
      }

      return {
        session: mapSession(data?.session),
        confirmationRequired: !data?.session
      };
    },

    async verifyAccessToken(token: string) {
      const client = getClient(options.anonKey);
      const { data, error } = await client.auth.getUser(token);

      if (error || !data?.user?.id) {
        throw authFailure(error?.message ?? "Bearer token is malformed, expired, or unsupported.");
      }

      const metadata = data.user.user_metadata ?? {};
      const participantRole =
        normalizeParticipantRole(metadata.participantRole) ??
        normalizeParticipantRole(metadata.partyType) ??
        normalizeParticipantRole(metadata.party_type);

      if (!participantRole) {
        throw authFailure("Authenticated user does not have a Verity participant role.");
      }

      return {
        userId: data.user.id,
        participantRole,
        accessToken: token,
        organizationRole:
          normalizeOrganizationRole(metadata.organizationRole) ??
          normalizeOrganizationRole(metadata.organization_role) ??
          "MEMBER"
      };
    }
  };
}

export const supabaseAuthService = createSupabaseAuthService({
  url: env.supabase.url,
  anonKey: env.supabase.anonKey,
  serviceRoleKey: env.supabase.serviceRoleKey
});
