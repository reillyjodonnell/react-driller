import { describe, it, expect } from "bun:test";
import { analyzeFiles, type AnalysisResult } from "./analysis";

function findComponent(result: AnalysisResult, file: string, name: string) {
  const fileEntry = result.files.find((f) => f.file.endsWith(file));
  expect(fileEntry).toBeDefined();
  const component = fileEntry?.components.find((c) => c.name === name);
  expect(component).toBeDefined();
  return component!;
}

function findState(
  result: AnalysisResult,
  file: string,
  component: string,
  state: string,
) {
  const found = findComponent(result, file, component).states.find(
    (s) => s.name === state,
  );
  expect(found).toBeDefined();
  return found!;
}

describe("analyzeFiles", () => {
  const result = analyzeFiles(["e2e/1-simple/app.tsx"]);

  it("detects the App component", () => {
    const app = findComponent(result, "1-simple/app.tsx", "App");
    expect(app.name).toBe("App");
  });

  it("marks a drilled state with its suggested ancestor", () => {
    const theme = findState(result, "1-simple/app.tsx", "App", "theme");
    expect(theme.drilled).toBe(true);
    expect(theme.suggestedAncestor).toBeDefined();
    expect(theme.suggestedAncestor?.name).toBe("ThemeToggle");
  });

  it("marks a co-located state as not drilled and omits the suggested ancestor", () => {
    const count = findState(result, "1-simple/app.tsx", "App", "count");
    expect(count.drilled).toBe(false);
    expect(count.suggestedAncestor).toBeUndefined();
  });

  it("counts at least one drilling finding in the summary", () => {
    expect(result.summary.drillingFindings).toBeGreaterThanOrEqual(1);
    expect(result.summary.statesFound).toBe(2);
    expect(result.summary.filesScanned).toBe(1);
  });

  it("emits only repo-relative paths", () => {
    for (const file of result.files) {
      expect(file.file.startsWith("/")).toBe(false);
      for (const component of file.components) {
        expect(component.location.file.startsWith("/")).toBe(false);
        for (const state of component.states) {
          expect(state.location.file.startsWith("/")).toBe(false);
          if (state.suggestedAncestor) {
            expect(
              state.suggestedAncestor.location.file.startsWith("/"),
            ).toBe(false);
          }
        }
      }
    }
  });
});
