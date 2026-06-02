import type { AuthContext } from "./auth-token.js";
import {
  type BodyRecord,
  type SupabaseDomainClient,
  insertRow,
  numberOrUndefined,
  requiredString,
  unwrap
} from "./domain-service-utils.js";

export interface AuditEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  reasonCode?: string | null;
  correlationId?: string | null;
  payload?: BodyRecord;
}

export interface AuditQuery {
  aggregateType?: unknown;
  aggregateId?: unknown;
  eventType?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  cursor?: unknown;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return stringValue(value[0]);
  }
  return undefined;
}

function limitValue(value: unknown): number {
  const parsed = numberOrUndefined(stringValue(value));
  if (parsed === undefined) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function mapAuditRow(row: BodyRecord) {
  return {
    id: requiredString(row, "id"),
    aggregateType: requiredString(row, "aggregate_type"),
    aggregateId: requiredString(row, "aggregate_id"),
    eventType: requiredString(row, "event_type"),
    actorUserId: requiredString(row, "actor_user_id") ?? null,
    actorPartyId: requiredString(row, "actor_party_id") ?? null,
    reasonCode: requiredString(row, "reason_code") ?? null,
    correlationId: requiredString(row, "correlation_id") ?? null,
    payload: row.payload ?? {},
    createdAt: requiredString(row, "created_at")
  };
}

export function emitAuditEvent(client: SupabaseDomainClient, auth: AuthContext, input: AuditEventInput) {
  return unwrap(
    "Emit audit event",
    insertRow(client, "audit_events", {
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      event_type: input.eventType,
      actor_user_id: auth.userId,
      actor_party_id: null,
      reason_code: input.reasonCode ?? null,
      correlation_id: input.correlationId ?? null,
      payload: input.payload ?? {}
    })
  );
}

export async function queryAuditEvents(client: SupabaseDomainClient, query: AuditQuery = {}) {
  let builder = client
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false });

  const aggregateType = stringValue(query.aggregateType);
  if (aggregateType) {
    builder = builder.eq("aggregate_type", aggregateType);
  }

  const aggregateId = stringValue(query.aggregateId);
  if (aggregateId) {
    builder = builder.eq("aggregate_id", aggregateId);
  }

  const eventType = stringValue(query.eventType);
  if (eventType) {
    builder = builder.eq("event_type", eventType);
  }

  const from = stringValue(query.from);
  if (from) {
    builder = builder.gte("created_at", from);
  }

  const to = stringValue(query.to);
  if (to) {
    builder = builder.lte("created_at", to);
  }

  const rows = (await unwrap<BodyRecord[]>("Query audit events", builder.limit(limitValue(query.limit)))) as BodyRecord[];

  return {
    events: rows.map(mapAuditRow),
    nextCursor: null
  };
}
