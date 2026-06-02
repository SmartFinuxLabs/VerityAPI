import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { emitAuditEvent, queryAuditEvents } from "../../src/services/audit-service.js";

const auth: AuthContext = {
  userId: "operator-1",
  participantRole: "OPERATOR",
  organizationRole: "SUPER_USER"
};

describe("audit service", () => {
  it("persists audit events with actor, aggregate, reason, and payload", async () => {
    const maybeSingle = jest.fn(async () => ({
      data: {
        id: "audit-1",
        aggregate_type: "INVOICE",
        aggregate_id: "invoice-1",
        event_type: "INVOICE_SUBMITTED"
      },
      error: null
    }));
    const select = jest.fn(() => ({ maybeSingle }));
    const insert = jest.fn(() => ({ select }));
    const client = {
      rpc: jest.fn(),
      from: jest.fn(() => ({ insert }))
    };

    await expect(
      emitAuditEvent(client, auth, {
        aggregateType: "INVOICE",
        aggregateId: "invoice-1",
        eventType: "INVOICE_SUBMITTED",
        reasonCode: "ERR_CONFLICT",
        payload: {
          state: "SUBMITTED"
        }
      })
    ).resolves.toEqual({
      id: "audit-1",
      aggregate_type: "INVOICE",
      aggregate_id: "invoice-1",
      event_type: "INVOICE_SUBMITTED"
    });

    expect(client.from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalledWith({
      aggregate_type: "INVOICE",
      aggregate_id: "invoice-1",
      event_type: "INVOICE_SUBMITTED",
      actor_user_id: "operator-1",
      actor_party_id: null,
      reason_code: "ERR_CONFLICT",
      correlation_id: null,
      payload: {
        state: "SUBMITTED"
      }
    });
  });

  it("returns operator audit events with contract response shape and filters", async () => {
    const limit = jest.fn(async () => ({
      data: [
        {
          id: "audit-1",
          aggregate_type: "INVOICE",
          aggregate_id: "invoice-1",
          event_type: "INVOICE_SUBMITTED",
          actor_user_id: "operator-1",
          actor_party_id: null,
          reason_code: null,
          correlation_id: "corr-1",
          payload: { state: "SUBMITTED" },
          created_at: "2026-06-02T00:00:00.000Z"
        }
      ],
      error: null
    }));
    const lte = jest.fn(() => ({ limit }));
    const gte = jest.fn(() => ({ lte, limit }));
    const eventEq = jest.fn(() => ({ gte, lte, limit }));
    const aggregateIdEq = jest.fn(() => ({ eq: eventEq, gte, lte, limit }));
    const aggregateEq = jest.fn(() => ({ eq: aggregateIdEq, gte, lte, limit }));
    const order = jest.fn(() => ({ eq: aggregateEq, gte, lte, limit }));
    const select = jest.fn(() => ({ order }));
    const client = {
      rpc: jest.fn(),
      from: jest.fn(() => ({ select }))
    };

    await expect(
      queryAuditEvents(client, {
        aggregateType: "INVOICE",
        aggregateId: "invoice-1",
        eventType: "INVOICE_SUBMITTED",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-03T00:00:00.000Z",
        limit: "25"
      })
    ).resolves.toEqual({
      events: [
        {
          id: "audit-1",
          aggregateType: "INVOICE",
          aggregateId: "invoice-1",
          eventType: "INVOICE_SUBMITTED",
          actorUserId: "operator-1",
          actorPartyId: null,
          reasonCode: null,
          correlationId: "corr-1",
          payload: { state: "SUBMITTED" },
          createdAt: "2026-06-02T00:00:00.000Z"
        }
      ],
      nextCursor: null
    });

    expect(client.from).toHaveBeenCalledWith("audit_events");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(aggregateEq).toHaveBeenCalledWith("aggregate_type", "INVOICE");
    expect(aggregateIdEq).toHaveBeenCalledWith("aggregate_id", "invoice-1");
    expect(eventEq).toHaveBeenCalledWith("event_type", "INVOICE_SUBMITTED");
    expect(gte).toHaveBeenCalledWith("created_at", "2026-06-01T00:00:00.000Z");
    expect(lte).toHaveBeenCalledWith("created_at", "2026-06-03T00:00:00.000Z");
    expect(limit).toHaveBeenCalledWith(25);
  });
});
