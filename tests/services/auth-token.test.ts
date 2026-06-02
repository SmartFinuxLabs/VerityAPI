import { describe, expect, it } from "@jest/globals";
import { parseAuthToken } from "../../src/services/auth-token.js";

describe("parseAuthToken", () => {
  it("parses a supported Phase 1 test token into auth context", () => {
    expect(parseAuthToken("test:user-1:SUPPLIER:MEMBER")).toEqual({
      userId: "user-1",
      participantRole: "SUPPLIER",
      organizationRole: "MEMBER"
    });
  });

  it("rejects malformed and expired tokens", () => {
    expect(parseAuthToken("not-a-supported-token")).toBeNull();
    expect(parseAuthToken("test:expired:SUPPLIER:MEMBER")).toBeNull();
  });

  it("rejects unsupported participant and organization roles", () => {
    expect(parseAuthToken("test:user-1:ADMIN:MEMBER")).toBeNull();
    expect(parseAuthToken("test:user-1:SUPPLIER:OWNER")).toBeNull();
  });
});
