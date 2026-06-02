import { describe, expect, it } from "@jest/globals";
import { optionalEnv, parsePort } from "../../src/config/env.js";

describe("env helpers", () => {
  describe("parsePort", () => {
    it("returns fallback when value is missing or invalid", () => {
      expect(parsePort(undefined, 8080)).toBe(8080);
      expect(parsePort("not-a-number", 8080)).toBe(8080);
    });

    it("parses numeric port values", () => {
      expect(parsePort("3001", 8080)).toBe(3001);
    });
  });

  describe("optionalEnv", () => {
    it("returns undefined for missing or blank values", () => {
      expect(optionalEnv(undefined)).toBeUndefined();
      expect(optionalEnv("   ")).toBeUndefined();
    });

    it("trims present values", () => {
      expect(optionalEnv("  value  ")).toBe("value");
    });
  });
});
