import type { ReasonCode } from "../contracts/verity-domain.js";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly reasonCode: ReasonCode;
  readonly details?: unknown;

  constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    reasonCode: ReasonCode;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.reasonCode = params.reasonCode;
    this.details = params.details;
  }
}

export function notImplemented(operation: string): ApiError {
  return new ApiError({
    statusCode: 501,
    code: "not_implemented",
    message: `${operation} is defined in the Phase 1 API contract but is not implemented yet.`,
    reasonCode: "ERR_NOT_IMPLEMENTED"
  });
}
