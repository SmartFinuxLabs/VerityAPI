import { describe, expect, it } from "@jest/globals";
import { ApiError, notImplemented } from "../../src/errors/api-error.js";

describe("ApiError helpers", () => {
  it("preserves status, code, reason, and optional details", () => {
    const error = new ApiError({
      statusCode: 422,
      code: "validation_failed",
      message: "Invalid request.",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS",
      details: { field: "invoiceNumber" }
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe("validation_failed");
    expect(error.reasonCode).toBe("ERR_MISSING_REQUIRED_FIELDS");
    expect(error.details).toEqual({ field: "invoiceNumber" });
  });

  it("creates contract-aware not implemented errors", () => {
    expect(notImplemented("Create invoice")).toMatchObject({
      statusCode: 501,
      code: "not_implemented",
      message: "Create invoice is defined in the Phase 1 API contract but is not implemented yet.",
      reasonCode: "ERR_NOT_IMPLEMENTED"
    });
  });
});
