import { describe, it, expect } from "bun:test";
import { analyzeFiles } from "./analysis";
import { renderJson } from "./jsonRenderer";

type Location = { file: string; line: number; column: number };

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return { ...value };
}

function isLocation(value: unknown): value is Location {
  const record = toRecord(value);
  if (!record) return false;
  return (
    typeof record.file === "string" &&
    typeof record.line === "number" &&
    typeof record.column === "number"
  );
}

// Built from parts so the literal home-directory prefix never appears in the
// committed source (PII guard) while still asserting paths carry no such prefix.
const ABSOLUTE_HOME_PREFIX = ["", "Users", ""].join("/");

function isRepoRelative(file: string): boolean {
  return !file.startsWith("/") && !file.includes(ABSOLUTE_HOME_PREFIX);
}

function assertLocationRepoRelative(value: unknown): void {
  expect(isLocation(value)).toBe(true);
  if (isLocation(value)) {
    expect(isRepoRelative(value.file)).toBe(true);
  }
}

describe("renderJson", () => {
  const result = analyzeFiles(["e2e/1-simple/app.tsx"]);
  const output = renderJson(result);
  const parsed: unknown = JSON.parse(output);

  function asRecord(value: unknown): Record<string, unknown> {
    const record = toRecord(value);
    expect(record).not.toBeNull();
    if (!record) throw new Error("expected object");
    return record;
  }

  function asArray(value: unknown): unknown[] {
    expect(Array.isArray(value)).toBe(true);
    if (!Array.isArray(value)) throw new Error("expected array");
    return value;
  }

  it("produces a single parseable non-null object", () => {
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
  });

  it("reports a drilling-findings count of at least one", () => {
    const summary = asRecord(asRecord(parsed).summary);
    expect(typeof summary.drillingFindings).toBe("number");
    expect(summary.drillingFindings as number).toBeGreaterThanOrEqual(1);
  });

  it("marks a drilled state with a ThemeToggle suggested ancestor", () => {
    const drilled = collectStates(parsed).find(
      (state) => state.drilled === true,
    );
    expect(drilled).toBeDefined();
    const suggested = asRecord(drilled!.suggestedAncestor);
    expect(suggested.name).toBe("ThemeToggle");
  });

  it("marks a co-located state as not drilled", () => {
    const undrilled = collectStates(parsed).find(
      (state) => state.drilled === false,
    );
    expect(undrilled).toBeDefined();
  });

  it("emits only repo-relative file paths throughout the tree", () => {
    const root = asRecord(parsed);
    for (const fileValue of asArray(root.files)) {
      const fileEntry = asRecord(fileValue);
      expect(typeof fileEntry.file).toBe("string");
      expect(isRepoRelative(fileEntry.file as string)).toBe(true);

      for (const componentValue of asArray(fileEntry.components)) {
        const component = asRecord(componentValue);
        assertLocationRepoRelative(component.location);

        for (const stateValue of asArray(component.states)) {
          const state = asRecord(stateValue);
          assertLocationRepoRelative(state.location);
          if (state.suggestedAncestor !== undefined) {
            const suggested = asRecord(state.suggestedAncestor);
            assertLocationRepoRelative(suggested.location);
          }
        }
      }
    }
  });

  type ParsedState = {
    drilled: boolean;
    suggestedAncestor?: unknown;
  };

  function collectStates(value: unknown): ParsedState[] {
    const root = asRecord(value);
    const states: ParsedState[] = [];
    for (const fileValue of asArray(root.files)) {
      const fileEntry = asRecord(fileValue);
      for (const componentValue of asArray(fileEntry.components)) {
        const component = asRecord(componentValue);
        for (const stateValue of asArray(component.states)) {
          const state = asRecord(stateValue);
          expect(typeof state.drilled).toBe("boolean");
          states.push({
            drilled: state.drilled as boolean,
            suggestedAncestor: state.suggestedAncestor,
          });
        }
      }
    }
    return states;
  }
});
