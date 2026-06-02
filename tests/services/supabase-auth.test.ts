import { describe, expect, it, jest } from "@jest/globals";
import { ApiError } from "../../src/errors/api-error.js";
import {
  createSupabaseAuthService,
  type SupabaseAuthClient,
  type SupabaseClientFactory
} from "../../src/services/supabase-auth.js";

function createAuthClient(overrides: Partial<SupabaseAuthClient["auth"]>): SupabaseAuthClient {
  return {
    auth: {
      getUser: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      ...overrides
    },
    rpc: jest.fn(),
    from: jest.fn()
  };
}

describe("Supabase auth service", () => {
  it("maps Supabase sign-in sessions to UI-safe API sessions", async () => {
    const client = createAuthClient({
      signInWithPassword: jest.fn(async () => ({
        data: {
          session: {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_at: 1780315200,
            user: {
              id: "user_123",
              email: "buyer@test.local",
              user_metadata: { participantRole: "Buyer" }
            }
          }
        },
        error: null
      }))
    });
    const factory: SupabaseClientFactory = jest.fn(() => client);

    const service = createSupabaseAuthService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      serviceRoleKey: "service-role-key",
      createClient: factory
    });

    await expect(service.signIn({ email: "buyer@test.local", password: "secret" })).resolves.toEqual({
      session: {
        user: {
          id: "user_123",
          email: "buyer@test.local",
          userMetadata: { participantRole: "Buyer" }
        },
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: "2026-06-01T12:00:00.000Z"
      }
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "buyer@test.local",
      password: "secret"
    });
  });

  it("throws AUTH_FAILURE when Supabase rejects sign-in", async () => {
    const client = createAuthClient({
      signInWithPassword: jest.fn(async () => ({
        data: { session: null },
        error: { message: "Invalid login credentials" }
      }))
    });

    const service = createSupabaseAuthService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      createClient: jest.fn(() => client)
    });

    await expect(service.signIn({ email: "buyer@test.local", password: "bad" })).rejects.toMatchObject({
      statusCode: 401,
      code: "auth_failure",
      reasonCode: "AUTH_FAILURE",
      message: "Invalid login credentials"
    });
  });

  it("throws a configuration error when Supabase credentials are missing", async () => {
    const service = createSupabaseAuthService({
      url: undefined,
      anonKey: undefined,
      createClient: jest.fn()
    });

    await expect(service.signIn({ email: "buyer@test.local", password: "secret" })).rejects.toBeInstanceOf(ApiError);
    await expect(service.signIn({ email: "buyer@test.local", password: "secret" })).rejects.toMatchObject({
      statusCode: 500,
      code: "supabase_not_configured",
      reasonCode: "ERR_INTERNAL_SERVER_ERROR"
    });
  });

  it("maps registration sessions and confirmation-required responses", async () => {
    const client = createAuthClient({
      signUp: jest.fn(async () => ({
        data: {
          session: null,
          user: { id: "new_user", email: "new@test.local", user_metadata: {} }
        },
        error: null
      }))
    });
    const service = createSupabaseAuthService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      createClient: jest.fn(() => client)
    });

    await expect(
      service.register({
        email: "new@test.local",
        password: "secret-password",
        fullName: "New User",
        entityName: "New Entity",
        participantRole: "Supplier",
        partyType: "SUPPLIER"
      })
    ).resolves.toEqual({
      session: undefined,
      confirmationRequired: true
    });
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "new@test.local",
      password: "secret-password",
      options: {
        data: {
          fullName: "New User",
          entityName: "New Entity",
          participantRole: "Supplier",
          partyType: "SUPPLIER"
        }
      }
    });
  });

  it("verifies Supabase access tokens into API auth context", async () => {
    const client = createAuthClient({
      getUser: jest.fn(async () => ({
        data: {
          user: {
            id: "user_789",
            email: "buyer@test.local",
            user_metadata: {
              party_type: "BUYER",
              organization_role: "SUPER_USER"
            }
          }
        },
        error: null
      }))
    });
    const service = createSupabaseAuthService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      createClient: jest.fn(() => client)
    });

    await expect(service.verifyAccessToken("access-token")).resolves.toEqual({
      userId: "user_789",
      participantRole: "BUYER",
      accessToken: "access-token",
      organizationRole: "SUPER_USER"
    });
    expect(client.auth.getUser).toHaveBeenCalledWith("access-token");
  });

  it("uses the sign-in role hint RPC from the Phase 1 migration", async () => {
    const client = createAuthClient({});
    client.rpc = jest.fn(async () => ({
      data: [{ participant_role: "SUPPLIER", organization_role: "MEMBER", organization_name: "Supply Co" }],
      error: null
    }));
    const service = createSupabaseAuthService({
      url: "https://supabase.test",
      anonKey: "anon-key",
      serviceRoleKey: "service-role-key",
      createClient: jest.fn(() => client)
    });

    await expect(service.getRoleHint("supplier@test.local")).resolves.toEqual({
      participantRole: "SUPPLIER",
      organizationRole: "MEMBER",
      organizationName: "Supply Co"
    });
    expect(client.rpc).toHaveBeenCalledWith("get_signin_role_hint", {
      p_email: "supplier@test.local"
    });
  });
});
