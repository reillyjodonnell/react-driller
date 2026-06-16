import { describe, it, expect } from "bun:test";
import { createFixture } from "./test-utils";
import { useStateExtractor } from "./analyzer";
import type { DrillerRoot } from "./node";

/**
 * Pointing react-driller at a large real codebase turns up `useState`
 * occurrences whose enclosing React component can't be resolved (e.g. a call
 * sitting at module top-level, or inside a function shape the analyzer doesn't
 * model). These are "can't classify this node" cases, not programmer errors —
 * the extractor must skip the single occurrence and keep walking the AST
 * rather than throwing and aborting the whole scan.
 */
describe("useStateExtractor skips occurrences with an unresolvable owner", () => {
  it("does not throw and omits a top-level module useState", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "top-level.tsx",
      source: `
        const [count, setCount] = useState(0);
      `,
    });

    let roots: DrillerRoot[] | undefined;
    expect(() => {
      roots = useStateExtractor(sourceFile, checker);
    }).not.toThrow();

    expect(roots).toEqual([]);
  });

  it("omits a useState inside a function with no resolvable owner symbol", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "helper.tsx",
      source: `
        const useThing = () => {
          const [value, setValue] = useState(0);
          return value;
        };
      `,
    });

    let roots: DrillerRoot[] | undefined;
    expect(() => {
      roots = useStateExtractor(sourceFile, checker);
    }).not.toThrow();

    expect(roots).toEqual([]);
  });

  it("skips the unresolvable occurrence but still records a real component in the same file", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "mixed.tsx",
      source: `
        const [loose, setLoose] = useState(0);

        function App() {
          const [count, setCount] = useState(0);
          return <span>{count}</span>;
        }
      `,
    });

    let roots: DrillerRoot[] | undefined;
    expect(() => {
      roots = useStateExtractor(sourceFile, checker);
    }).not.toThrow();

    expect(roots).toBeDefined();
    expect(roots!.length).toBe(1);
    expect(roots![0]?.name).toBe("App");
  });

  it("still detects a useState inside a real PascalCase component", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
        function App() {
          const [count, setCount] = useState(0);
          return null;
        }
      `,
    });

    const roots = useStateExtractor(sourceFile, checker);

    expect(roots.length).toBe(1);
    expect(roots[0]?.name).toBe("App");
  });
});
