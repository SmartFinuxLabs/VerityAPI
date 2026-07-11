export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Verity API",
    version: "0.1.0",
    description: "HTTP API for Verity onboarding, workspaces, invoice financeability, funding, settlement, and audit flows."
  },
  servers: [
    {
      url: "http://localhost:8080",
      description: "Local development"
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "test:<user-id>:<participant-role>:<organization-role> or Supabase JWT"
      }
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["code", "message", "correlationId", "reasonCode"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          correlationId: { type: "string" },
          reasonCode: { type: "string" }
        }
      },
      DataEnvelope: {
        type: "object",
        properties: {
          data: {}
        }
      }
    }
  },
  paths: {
    "/": {
      get: {
        summary: "Service status",
        tags: ["Status"],
        security: [],
        responses: {
          "200": {
            description: "Service status"
          }
        }
      }
    },
    "/api/v1/health": {
      get: {
        summary: "Health check",
        tags: ["Status"],
        security: [],
        responses: {
          "200": {
            description: "API health"
          }
        }
      }
    },
    "/api/v1/openapi.json": {
      get: {
        summary: "OpenAPI document",
        tags: ["Docs"],
        security: [],
        responses: {
          "200": {
            description: "OpenAPI schema"
          }
        }
      }
    },
    "/api/v1/api-docs": {
      get: {
        summary: "Interactive API documentation",
        tags: ["Docs"],
        security: [],
        responses: {
          "200": {
            description: "Swagger UI"
          }
        }
      }
    },
    "/api/v1/auth/role-hint": {
      get: {
        summary: "Read role hint for an email address",
        tags: ["Auth"],
        security: [],
        parameters: [
          {
            name: "email",
            in: "query",
            required: true,
            schema: { type: "string", format: "email" }
          }
        ],
        responses: {
          "200": { description: "Role hint" },
          "400": { description: "Missing email" }
        }
      }
    },
    "/api/v1/auth/sign-in": {
      post: {
        summary: "Sign in",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", format: "password" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Session" },
          "400": { description: "Missing credentials" }
        }
      }
    },
    "/api/v1/auth/register": {
      post: {
        summary: "Register",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "fullName", "entityName", "participantRole", "partyType"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", format: "password" },
                  fullName: { type: "string" },
                  entityName: { type: "string" },
                  participantRole: { type: "string", enum: ["Buyer", "Supplier", "Investor", "BUYER", "SUPPLIER", "INVESTOR"] },
                  partyType: { type: "string", enum: ["BUYER", "SUPPLIER", "INVESTOR"] },
                  invitationToken: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Registration result" },
          "400": { description: "Invalid registration payload" }
        }
      }
    },
    "/api/v1/workspaces/buyer": {
      get: {
        summary: "Buyer workspace state",
        tags: ["Workspaces"],
        responses: { "200": { description: "Buyer workspace state" } }
      }
    },
    "/api/v1/workspaces/supplier": {
      get: {
        summary: "Supplier workspace state",
        tags: ["Workspaces"],
        responses: { "200": { description: "Supplier workspace state" } }
      }
    },
    "/api/v1/workspaces/supplier/analytics": {
      get: {
        summary: "Supplier analytics",
        tags: ["Workspaces"],
        responses: { "200": { description: "Supplier analytics" } }
      }
    },
    "/api/v1/workspaces/investor": {
      get: {
        summary: "Investor workspace state",
        tags: ["Workspaces"],
        responses: { "200": { description: "Investor workspace state" } }
      }
    },
    "/api/v1/organizations/provision": {
      post: {
        summary: "Provision an organization",
        tags: ["Onboarding"],
        responses: { "201": { description: "Provisioned organization" } }
      }
    },
    "/api/v1/organizations/{organizationId}/memberships": {
      get: {
        summary: "List organization memberships",
        tags: ["Onboarding"],
        parameters: [{ name: "organizationId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Membership list" } }
      }
    },
    "/api/v1/memberships/{membershipId}/role": {
      patch: {
        summary: "Update membership role",
        tags: ["Onboarding"],
        parameters: [{ name: "membershipId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated membership" } }
      }
    },
    "/api/v1/organization-invitations": {
      post: {
        summary: "Create organization invitation",
        tags: ["Onboarding"],
        responses: { "201": { description: "Created invitation" } }
      }
    },
    "/api/v1/organization-invitations/{invitationToken}/accept": {
      post: {
        summary: "Accept organization invitation",
        tags: ["Onboarding"],
        parameters: [{ name: "invitationToken", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Accepted invitation" } }
      }
    },
    "/api/v1/organization-invitations/{invitationId}/revoke": {
      post: {
        summary: "Revoke organization invitation",
        tags: ["Onboarding"],
        parameters: [{ name: "invitationId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Revoked invitation" } }
      }
    },
    "/api/v1/relationships": {
      post: {
        summary: "Create buyer-supplier relationship",
        tags: ["Relationships"],
        responses: { "201": { description: "Created relationship" } }
      }
    },
    "/api/v1/relationships/{relationshipId}/invoice-mode": {
      patch: {
        summary: "Update relationship invoice mode",
        tags: ["Relationships"],
        parameters: [{ name: "relationshipId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated relationship invoice mode" } }
      }
    },
    "/api/v1/relationships/{relationshipId}/risk-profile": {
      put: {
        summary: "Upsert relationship risk profile",
        tags: ["Relationships"],
        parameters: [{ name: "relationshipId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Risk profile" } }
      }
    },
    "/api/v1/invoices": {
      post: {
        summary: "Create invoice",
        tags: ["Invoices"],
        responses: { "201": { description: "Created invoice" } }
      }
    },
    "/api/v1/invoices/{invoiceId}/resolution": {
      post: {
        summary: "Create invoice resolution",
        tags: ["Invoices"],
        parameters: [{ name: "invoiceId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created invoice resolution" } }
      }
    },
    "/api/v1/invoices/{invoiceId}/hash": {
      post: {
        summary: "Register invoice hash",
        tags: ["Invoices"],
        parameters: [{ name: "invoiceId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Registered invoice hash" } }
      }
    },
    "/api/v1/invoices/{invoiceId}/financeability": {
      post: {
        summary: "Evaluate invoice financeability",
        tags: ["Invoices"],
        parameters: [{ name: "invoiceId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Financeability result" } }
      }
    },
    "/api/v1/invoices/{invoiceId}/marketplace-submissions": {
      post: {
        summary: "Submit invoice to marketplace",
        tags: ["Funding"],
        parameters: [{ name: "invoiceId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Marketplace submission" } }
      }
    },
    "/api/v1/financeability/{financeabilityId}/offers": {
      post: {
        summary: "Create funding offer",
        tags: ["Funding"],
        parameters: [{ name: "financeabilityId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Funding offer" } }
      }
    },
    "/api/v1/offers/{offerId}/commitments": {
      post: {
        summary: "Create funding commitment",
        tags: ["Funding"],
        parameters: [{ name: "offerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Funding commitment" } }
      }
    },
    "/api/v1/commitments/{commitmentId}/settlement-instructions": {
      post: {
        summary: "Create settlement instruction",
        tags: ["Settlement"],
        parameters: [
          { name: "commitmentId", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } }
        ],
        responses: { "202": { description: "Settlement instruction accepted" } }
      }
    },
    "/api/v1/settlement/{instructionId}/status": {
      get: {
        summary: "Get settlement status",
        tags: ["Settlement"],
        parameters: [{ name: "instructionId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Settlement status" } }
      }
    },
    "/api/v1/audit/events": {
      get: {
        summary: "Query audit events",
        tags: ["Audit"],
        parameters: [
          { name: "actorUserId", in: "query", required: false, schema: { type: "string" } },
          { name: "entityType", in: "query", required: false, schema: { type: "string" } },
          { name: "entityId", in: "query", required: false, schema: { type: "string" } },
          { name: "eventType", in: "query", required: false, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Audit events" } }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
} as const;
