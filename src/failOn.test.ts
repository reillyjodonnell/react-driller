import { describe, it, expect } from "bun:test";
import {
  FAIL_ON_LEVELS,
  exitCodeFor,
  validateFailOnLevel,
} from "./failOn";

describe("exitCodeFor", () => {
  it("returns 0 for level 'none' even when drilling findings exist", () => {
    expect(exitCodeFor({ summary: { drillingFindings: 3 } }, "none")).toBe(0);
  });

  it("returns 1 for level 'findings' when there is at least one drilling finding", () => {
    expect(exitCodeFor({ summary: { drillingFindings: 3 } }, "findings")).toBe(
      1,
    );
  });

  it("returns 1 for level 'findings' on exactly one drilling finding", () => {
    expect(exitCodeFor({ summary: { drillingFindings: 1 } }, "findings")).toBe(
      1,
    );
  });

  it("returns 0 for level 'findings' when there are no drilling findings", () => {
    expect(exitCodeFor({ summary: { drillingFindings: 0 } }, "findings")).toBe(
      0,
    );
  });
});

describe("validateFailOnLevel", () => {
  it("validates 'none' as a valid level", () => {
    const result = validateFailOnLevel("none");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level).toBe("none");
    }
  });

  it("validates 'findings' as a valid level", () => {
    const result = validateFailOnLevel("findings");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.level).toBe("findings");
    }
  });

  it("rejects an unknown level and surfaces the raw value and valid levels", () => {
    const result = validateFailOnLevel("bogus");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe("bogus");
      expect(result.validLevels).toEqual(FAIL_ON_LEVELS);
    }
  });
});
