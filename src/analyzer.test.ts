import { describe, it, expect } from "bun:test";
import { Usage, type DrillerRoot } from "./node";
import { analyzeRoot, analyzeRoots, extractRoots, liftResult } from "./test-utils";
import { retrieveClosestCommonParentFromRoot } from "./analyzer";

/**
 * Tests are grouped by the three questions the analyzer answers, each backed by
 * one exported function:
 *   1. useStateExtractor
 *   2. scanNode
 *   3. retrieveClosestCommonParentFromRoot
 */

describe("useStateExtractor — where state is declared", () => {
  describe("import shapes", () => {
    it("handles a plain named import (`import { useState } from 'react'`)", () => {
      const root = analyzeRoot(`
        import { useState } from "react";
        function App() {
          const [count, setCount] = useState(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Renamed named import: the call site reads `us(0)`, so the text check
    // misses it. Resolving the symbol and walking the alias should land back
    // on `useState`.
    it("handles a renamed named import (`import { useState as us } from 'react'`)", () => {
      const root = analyzeRoot(`
        import { useState as us } from "react";
        function App() {
          const [count, setCount] = us(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Namespace import + property access. The property-access branch already
    // matches on `.name.text === "useState"`, so this should pass today even
    // though the namespace alias `R` differs from the conventional `React`.
    it("handles a namespace import (`import * as R from 'react'; R.useState(...)`)", () => {
      const root = analyzeRoot(`
        import * as R from "react";
        function App() {
          const [count, setCount] = R.useState(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Default import + property access (`import React from "react"`). Same
    // shape as the namespace case at the call site.
    it("handles a default import (`import React from 'react'; React.useState(...)`)", () => {
      const root = analyzeRoot(`
        import React from "react";
        function App() {
          const [count, setCount] = React.useState(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Combined default + renamed named import. Same alias-walk requirement as
    // the renamed-named-import case.
    it("handles default + renamed named (`import React, { useState as us } from 'react'`)", () => {
      const root = analyzeRoot(`
        import React, { useState as us } from "react";
        function App() {
          const [count, setCount] = us(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Local re-binding of the imported hook (`const u = useState; u(0)`). The
    // call-site identifier is `u`, whose symbol points at the local const, not
    // directly at the import. Resolving has to follow the initializer back to
    // the import alias.
    it("handles a local re-binding of the import (`const u = useState; u(0)`)", () => {
      const root = analyzeRoot(`
        import { useState } from "react";
        const u = useState;
        function App() {
          const [count, setCount] = u(0);
          return <Child count={count} />;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    it("handles namespaced useStates", () => {
      const root = analyzeRoot(`
        function App() {
          const [count, setCount] = React.useState(0);
          const show = true;
          return <div>{show && <Child count={count} />}</div>;
        }
        function Child({ count }) {
          return <span>{count}</span>;
        }
      `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    // Negative case: a non-React function literally named `useState` should
    // NOT be picked up once the analyzer is symbol-aware. Today the text
    // check produces a false positive here; after the alias-walk change it
    // should resolve to the local declaration and be ignored.
    it("ignores a locally-defined function that happens to be named useState", () => {
      const roots = extractRoots(`
        function useState(_: number): [number, (n: number) => void] {
          return [0, () => {}];
        }
        function App() {
          const [count, setCount] = useState(0);
          return <span>{count}</span>;
        }
      `);

      expect(roots).toHaveLength(0);
    });
  });

  describe("state hooks (useState / useReducer)", () => {
    // useReducer's [state, dispatch] tuple is modeled like useState's
    // [value, setter]: `state` is the value, `dispatch` is the setter.
    it("models useReducer and drills its state", () => {
      const [root] = analyzeRoots(`
        import { useReducer } from "react";
        function App() {
          const [state, dispatch] = useReducer(reducer, 0);
          return <Child state={state} />;
        }
        function Child({ state }) { return <span>{state}</span>; }
      `);
      expect(root?.name).toBe("App");
      expect(root?.usage).toBe(Usage.ForwardsGetter);
      expect(root?.children[0]?.name).toBe("Child");
    });

    // dispatch plays the setter's role, so forwarding it reads as a setter
    // forward and a child call reads as a Set.
    it("treats a forwarded dispatch as a setter forward", () => {
      const [root] = analyzeRoots(`
        import { useReducer } from "react";
        function App() {
          const [state, dispatch] = useReducer(reducer, 0);
          return <Child dispatch={dispatch} />;
        }
        function Child({ dispatch }) {
          return <button onClick={() => dispatch({ type: "inc" })}>+</button>;
        }
      `);
      expect(root?.usage).toBe(Usage.ForwardsSetter);
      expect(root?.children[0]?.usage).toBe(Usage.Sets);
    });

    it("detects a renamed useReducer import", () => {
      const [root] = analyzeRoots(`
        import { useReducer as useR } from "react";
        function App() {
          const [state, dispatch] = useR(reducer, 0);
          return <Child state={state} />;
        }
        function Child({ state }) { return <span>{state}</span>; }
      `);
      expect(root?.name).toBe("App");
      expect(root?.children[0]?.name).toBe("Child");
    });
  });

  describe("component shapes", () => {
    it("represents a basic prop-drilling path", () => {
      const [root] = extractRoots(`
    function App() {
      const [count, setCount] = useState(0);
      return null;
    }
  `);

      expect(root).toBeDefined();
      expect(root?.getter).not.toBeUndefined();
      expect(root?.setter).not.toBeUndefined();
      expect(root?.name).toBe("App");
    });

    it("captures useState inside an arrow-function component", () => {
      const roots = analyzeRoots(`
      const App = () => {
        const [count, setCount] = useState(0);
        return <span>{count}</span>;
      };
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    it("captures useState inside a function-expression component", () => {
      const roots = analyzeRoots(`
      const App = function () {
        const [count, setCount] = useState(0);
        return <span>{count}</span>;
      };
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    it("captures useState inside a named function-expression component", () => {
      const roots = analyzeRoots(`
      const App = function App() {
        const [count, setCount] = useState(0);
        return <span>{count}</span>;
      };
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    it("captures useState in an anonymous arrow wrapped in memo()", () => {
      const roots = analyzeRoots(`
      import { memo, useState } from "react";
      const App = memo(() => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      });
      function Child({ count }) { return <span>{count}</span>; }
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
      expect(roots[0]?.children[0]?.name).toBe("Child");
    });

    it("captures useState in a forwardRef render function", () => {
      const roots = analyzeRoots(`
      import { forwardRef, useState } from "react";
      const App = forwardRef((props, ref) => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      });
      function Child({ count }) { return <span>{count}</span>; }
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
      expect(roots[0]?.children[0]?.name).toBe("Child");
    });

    it("names the outer const for memo(function Inner(){}), not the inner name", () => {
      const roots = analyzeRoots(`
      import { memo, useState } from "react";
      const Outer = memo(function Inner() {
        const [count, setCount] = useState(0);
        return <span>{count}</span>;
      });
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("Outer");
    });

    it("captures useState through nested memo(forwardRef(...))", () => {
      const roots = analyzeRoots(`
      import { memo, forwardRef, useState } from "react";
      const App = memo(forwardRef((props, ref) => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      }));
      function Child({ count }) { return <span>{count}</span>; }
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    // Not just memo/forwardRef: any HOC that takes the render function as an
    // argument and is assigned to a variable resolves through the wrapper.
    it("captures useState through an arbitrary custom HOC", () => {
      const roots = analyzeRoots(`
      const withLog = (C) => C;
      const App = withLog(() => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      });
      function Child({ count }) { return <span>{count}</span>; }
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    // Curried HOC (connect-style): `connect(opts)(Component)`. The render
    // function is the argument of the inner call; both call layers are skipped.
    it("captures useState through a curried HOC (connect-style)", () => {
      const roots = analyzeRoots(`
      const connect = (m) => (C) => C;
      const App = connect({})(() => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      });
      function Child({ count }) { return <span>{count}</span>; }
    `);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe("App");
    });

    // The binding kind lives on the parent VariableDeclarationList, so
    // ts.isVariableDeclaration matches const, let, and var alike.
    for (const kw of ["const", "let", "var"] as const) {
      it(`resolves a plain arrow component bound via ${kw}`, () => {
        const roots = analyzeRoots(`
        import { useState } from "react";
        ${kw} App = () => {
          const [count, setCount] = useState(0);
          return <Child count={count} />;
        };
        function Child({ count }) { return <span>{count}</span>; }
      `);
        expect(roots).toHaveLength(1);
        expect(roots[0]?.name).toBe("App");
        expect(roots[0]?.children[0]?.name).toBe("Child");
      });

      it(`resolves a memo-wrapped component bound via ${kw}`, () => {
        const roots = analyzeRoots(`
        import { memo, useState } from "react";
        ${kw} App = memo(() => {
          const [count, setCount] = useState(0);
          return <Child count={count} />;
        });
        function Child({ count }) { return <span>{count}</span>; }
      `);
        expect(roots).toHaveLength(1);
        expect(roots[0]?.name).toBe("App");
      });
    }
  });

  /**
   * Pointing react-driller at a large real codebase turns up `useState`
   * occurrences whose enclosing React component can't be resolved (e.g. a call
   * at module top-level, or inside a function shape the analyzer doesn't
   * model). These are "can't classify this node" cases, not programmer errors —
   * the extractor must skip the single occurrence and keep walking rather than
   * throwing and aborting the whole scan.
   */
  describe("unresolvable owners are skipped, not thrown", () => {
    it("does not throw and omits a top-level module useState", () => {
      let roots: DrillerRoot[] | undefined;
      expect(() => {
        roots = extractRoots(`
        const [count, setCount] = useState(0);
      `);
      }).not.toThrow();

      expect(roots).toEqual([]);
    });

    it("omits a useState inside a function with no resolvable owner symbol", () => {
      let roots: DrillerRoot[] | undefined;
      expect(() => {
        roots = extractRoots(`
        const useThing = () => {
          const [value, setValue] = useState(0);
          return value;
        };
      `);
      }).not.toThrow();

      expect(roots).toEqual([]);
    });

    it("skips the unresolvable occurrence but still records a real component in the same file", () => {
      let roots: DrillerRoot[] | undefined;
      expect(() => {
        roots = extractRoots(`
        const [loose, setLoose] = useState(0);

        function App() {
          const [count, setCount] = useState(0);
          return <span>{count}</span>;
        }
      `);
      }).not.toThrow();

      expect(roots).toBeDefined();
      expect(roots!.length).toBe(1);
      expect(roots![0]?.name).toBe("App");
    });

    it("still detects a useState inside a real PascalCase component", () => {
      const roots = extractRoots(`
        function App() {
          const [count, setCount] = useState(0);
          return null;
        }
      `);

      expect(roots.length).toBe(1);
      expect(roots[0]?.name).toBe("App");
    });
  });

  describe("known gaps", () => {
    // `export default memo(() => {...})` (or a bare `export default () => {}`)
    // has no variable binding, so the component has no resolvable name and its
    // state is dropped. Common in Next.js pages and many component files.
    it("does not see an anonymous default-exported component", () => {
      const roots = extractRoots(`
        import { memo, useState } from "react";
        export default memo(() => {
          const [count, setCount] = useState(0);
          return <Child count={count} />;
        });
        function Child({ count }) { return <span>{count}</span>; }
      `);
      expect(roots).toHaveLength(0); // FLIP to 1 when default exports are named
    });
  });

  // A custom-hook call is a `useState` at the call site — the *calling* component
  // owns the instance, so it becomes the root and the destructured bindings take
  // their getter/setter roles from how the hook's return expression reads/forwards
  // its internal state. Roles are traced through the hook body, never inferred
  // from `setX` naming (real hooks expose `increment`, `toggle`, `reset`, …).
  describe("custom hooks that own state", () => {
    // 1. Tuple return — the useState mirror. `toggle` is a useCallback carrier of
    // the internal setter; slot 0 reads the value, slot 1 forwards the setter.
    it("drills a tuple-returning hook (useToggle) into the child", () => {
      const root = analyzeRoot(`
        function useToggle(init = false) {
          const [on, setOn] = useState(init);
          const toggle = useCallback(() => setOn((o) => !o), []);
          return [on, toggle];
        }
        function App() {
          const [open, toggleOpen] = useToggle();
          return <Panel open={open} onToggle={toggleOpen} />;
        }
        function Panel({ open, onToggle }) {
          return <button onClick={onToggle}>{open ? "on" : "off"}</button>;
        }
      `);
      expect(root.name).toBe("App");
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Panel");
      expect(root.children[0]?.usage).toBe(Usage.Gets | Usage.Sets);
    });

    // 2. Object return with named actions (NOT setX) — the trace-don't-name case.
    // `increment`/`reset` close over the internal setter, so both are setters.
    it("drills an object-returning action hook (useCounter)", () => {
      const root = analyzeRoot(`
        function useCounter(start = 0) {
          const [count, setCount] = useState(start);
          return {
            count,
            increment: () => setCount((c) => c + 1),
            reset: () => setCount(0),
          };
        }
        function App() {
          const { count, increment, reset } = useCounter();
          return <Display count={count} onInc={increment} onReset={reset} />;
        }
        function Display({ count, onInc, onReset }) {
          return (
            <div>
              {count}
              <button onClick={onInc}>+</button>
              <button onClick={onReset}>0</button>
            </div>
          );
        }
      `);
      expect(root.name).toBe("App");
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Display");
      expect(root.children[0]?.usage).toBe(Usage.Gets | Usage.Sets);
    });

    // 3. Renamed object destructure at the call site (`{ value: email, setValue: setEmail }`)
    // — slots are matched by property name, then bound to the renamed locals.
    it("drills an object hook through a renamed destructure (useField)", () => {
      const root = analyzeRoot(`
        function useField(init) {
          const [value, setValue] = useState(init);
          return { value, setValue };
        }
        function App() {
          const { value: email, setValue: setEmail } = useField("");
          return <Input value={email} onChange={setEmail} />;
        }
        function Input({ value, onChange }) {
          return <input value={value} onChange={(e) => onChange(e.target.value)} />;
        }
      `);
      expect(root.name).toBe("App");
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Input");
      expect(root.children[0]?.usage).toBe(Usage.Gets | Usage.Sets);
    });

    // 4. Pass-through: the hook returns the `useState` tuple directly, so the
    // slots inherit useState's own (value, setter) roles.
    it("drills a hook that returns the useState tuple directly (useName)", () => {
      const root = analyzeRoot(`
        function useName() {
          return useState("");
        }
        function App() {
          const [name, setName] = useName();
          return <Field name={name} setName={setName} />;
        }
        function Field({ name, setName }) {
          return <input value={name} onChange={(e) => setName(e.target.value)} />;
        }
      `);
      expect(root.name).toBe("App");
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Field");
      expect(root.children[0]?.usage).toBe(Usage.Gets | Usage.Sets);
    });
  });
});

describe("scanNode — how state flows", () => {
  describe("usage flags (gets / sets / forwards)", () => {
    it("accounts for using a value / setting and distinguishes from merely passing props", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return  (
      <Child count={count} />
      );
    }

    function Child({count}){
      return null
    }
  `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
    });

    it("distinguishes between reading and forwarding as props", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return (
      <button> {count} </button>
      );
    }
  `);

      expect(root.usage).not.toBe(Usage.ForwardsGetter);
      expect(root.usage).toBe(Usage.Gets);
    });

    // A setter invoked inside an event handler attached to a *host* element
    // (lowercase `button`) counts as a Set on the enclosing component — not as
    // forwarding — because the call expression sits above the identifier, so
    // `node.parent` is a CallExpression rather than a JsxExpression.
    it("treats setter called inside a host-element event handler as Sets", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return (
          <button onClick={() => setCount((c) => c + 1)}>
            {count}
          </button>
        );
      }
    `);

      expect(root.usage).toBe(Usage.Gets | Usage.Sets);
      expect(root.children.length).toBe(0);
    });

    // A value read directly into a host-element attribute (`<input value={name}/>`)
    // is consumed right here, not forwarded — a host tag has no component to drill
    // into. Marked as Gets on the enclosing component.
    it("marks Gets for state read into a host-element attribute", () => {
      const root = analyzeRoot(`
      function App() {
        const [name, setName] = useState("");
        return <input value={name} readOnly />;
      }
    `);

      expect(root.usage).toBe(Usage.Gets);
      expect(root.children.length).toBe(0);
    });

    // A setter passed *bare* (no wrapping arrow) as a host event handler
    // (`onClick={setN}`) is also a use, not a forward — the identifier sits
    // directly on the attribute of a host tag. Marked as Sets.
    it("marks Sets for a bare setter on a host event handler", () => {
      const root = analyzeRoot(`
      function App() {
        const [n, setN] = useState(0);
        return <button onClick={setN}>+</button>;
      }
    `);

      expect(root.usage).toBe(Usage.Sets);
      expect(root.children.length).toBe(0);
    });

    // The canonical controlled input: the value is read into the `value`
    // attribute (Gets) and the setter is called from the `onChange` handler
    // (Sets). Both are local uses on a host element, so nothing is forwarded.
    it("marks Gets and Sets for a controlled input (value + onChange setter)", () => {
      const root = analyzeRoot(`
      function App() {
        const [name, setName] = useState("");
        return <input value={name} onChange={(e) => setName(e.target.value)} />;
      }
    `);

      expect(root.usage).toBe(Usage.Gets | Usage.Sets);
      expect(root.children.length).toBe(0);
    });

    // State referenced inside a JSX fragment's text content (not in any
    // attribute position) should be marked as Gets, mirroring the
    // `<button>{count}</button>` case but using a `<>...</>` wrapper.
    it("marks Gets for state inside JSX fragment text content", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return (
          <>
            <span>{count}</span>
          </>
        );
      }
    `);

      expect(root.usage).toBe(Usage.Gets);
      expect(root.children.length).toBe(0);
    });

    // When useState exists but nothing in the component body references the
    // bindings, usage stays at Usage.None and no children are produced.
    it("leaves usage as None when state is declared but never used", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return <div>hello</div>;
      }
    `);

      expect(root.usage).toBe(Usage.None);
      expect(root.children.length).toBe(0);
    });
  });

  describe("children & dedup", () => {
    it("adds child when detects props", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return  (
      <Child count={count} />
      );
    }

    function Child({count}){
      return null
    }

  `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
    });

    it("tracks symbol across component (function) jump", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return  (
      <Child rename={count} />
      );
    }

    function Child({rename}: {rename: number}){
       return (

         <span>{rename}</span>
         <GrandChild another={rename}></GrandChild>
       )
    }


    function GrandChild({another}){
      return <span>{another}</span>
    }
  `);

      expect(root.children.length).toBe(1);
      const child = root.children[0];
      expect(child?.children.length).toBe(1);

      expect(root.children[0]?.usage).toStrictEqual(Usage.Gets | Usage.ForwardsGetter);
      expect(child?.children[0]?.usage).toStrictEqual(Usage.Gets);
    });

    it("should detect components that return children from props e.g. slot components", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);

      return (
        <Layout>
          <MainPanel count={count} setCount={setCount} />
        </Layout>
      );
    }

    function Layout({ children }) {
      return <div className="layout">{children}</div>;
    }

    function MainPanel({ count, setCount }) {
      return (
        <section>
        main panel
        </section>
      );
    }


  `);

      expect(root.children.length).toBe(1);
    });

    it("should detect setter usage from a child", () => {
      const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return <Child setCount={setCount} />;
    }

    function Child({ setCount }) {
      return <button onClick={() => setCount((c) => c + 1)}>+1</button>;
    }
  `);

      expect(root.children.length).toBe(1);
      const child = root.children[0];
      expect(child?.name).toBe("Child");
      expect(child?.usage).toBe(Usage.Sets);
    });

    // Renaming during destructure on the *child* side: `{ count: c }`.
    // matchPropBinding uses `propertyName` as the prop key and `name` as the
    // local binding, so subsequent uses of `c` resolve back to the parent's
    // `count` symbol.
    it("follows renamed destructure in the child param ({ count: c })", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      }
      function Child({ count: c }) {
        return <span>{c}</span>;
      }
    `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
      expect(root.children[0]?.usage).toBe(Usage.Gets);
    });

    // When the same component receives both getter and setter as two separate
    // attributes, scanNode must dedupe the child rather than creating one
    // DrillerNode per attribute.
    it("dedupes a child when both getter and setter are forwarded as separate props", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return <Child count={count} setCount={setCount} />;
      }
      function Child({ count, setCount }) {
        return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
      }
    `);

      expect(root.children.length).toBe(1);
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);
      expect(root.children[0]?.usage).toBe(Usage.Gets | Usage.Sets);
    });

    // Sibling fork: the getter is handed to one child and the setter to another.
    // The tree should branch, with each sibling holding its own usage flag.
    it("forks the tree when getter and setter go to two sibling components", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return (
          <>
            <Display count={count} />
            <Controls setCount={setCount} />
          </>
        );
      }
      function Display({ count }) {
        return <span>{count}</span>;
      }
      function Controls({ setCount }) {
        return <button onClick={() => setCount(0)}>reset</button>;
      }
    `);

      expect(root.children.length).toBe(2);
      expect(root.usage).toBe(Usage.ForwardsGetter | Usage.ForwardsSetter);

      const display = root.children.find((c) => c.name === "Display");
      const controls = root.children.find((c) => c.name === "Controls");
      expect(display?.usage).toBe(Usage.Gets);
      expect(controls?.usage).toBe(Usage.Sets);
    });

    // Child uses a non-destructured `(props: Props)` parameter instead of
    // `{ count }`. Today matchPropBinding only knows how to walk
    // ObjectBindingPattern, so the analyzer currently throws "no op - symbol
    // didn't match on the flip from parent to child" on this shape. Real-world
    // React codebases mix destructured and non-destructured props freely, so
    // this case has to be handled before the tool can be pointed at one. This
    // test pins the desired behavior: don't throw, record forwarding on the
    // parent, and create a child node for Child.
    it("handles non-destructured (props: Props) child params without throwing", () => {
      expect(() => {
        const root = analyzeRoot(`
        function App() {
          const [count, setCount] = useState(0);
          return <Child count={count} />;
        }
        function Child(props: { count: number }) {
          return <span>{props.count}</span>;
        }
      `);

        expect(root.usage & Usage.ForwardsGetter).toBe(Usage.ForwardsGetter);
        expect(root.children.length).toBe(1);
        expect(root.children[0]?.name).toBe("Child");
      }).not.toThrow();
    });

    // Conditional rendering with `&&` keeps the identifier as a direct child of
    // a JsxExpression on the inner element's attribute, so forwarding is still
    // detected.
    it("detects forwarding through a `cond && <Child ... />` branch", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        const show = true;
        return <div>{show && <Child count={count} />}</div>;
      }
      function Child({ count }) {
        return <span>{count}</span>;
      }
    `);

      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Child");
    });

    it("tracks drilling out of an arrow component the same as a function declaration", () => {
      const roots = analyzeRoots(`
      const App = () => {
        const [count, setCount] = useState(0);
        return <Child count={count} />;
      };
      function Child({ count }) {
        return <span>{count}</span>;
      }
    `);
      expect(roots).toHaveLength(1);
      const [root] = roots;
      expect(root?.children).toHaveLength(1);
      expect(root?.children[0]?.name).toBe("Child");
      expect(root?.children[0]?.usage).toBe(Usage.Gets);
    });

    it("drills into a memo-wrapped child and labels it by its JSX tag", () => {
      const [root] = analyzeRoots(`
      import { memo, useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        return <Display count={count} />;
      }
      const Display = memo(({ count }) => <span>{count}</span>);
    `);
      expect(root?.children).toHaveLength(1);
      expect(root?.children[0]?.name).toBe("Display");
      expect(root?.children[0]?.usage).toBe(Usage.Gets);
    });

    it("labels an arrow-function child by its JSX tag, not the prop name", () => {
      const [root] = analyzeRoots(`
      import { useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        return <Display count={count} />;
      }
      const Display = ({ count }) => <span>{count}</span>;
    `);
      expect(root?.children[0]?.name).toBe("Display");
    });
  });

  describe("known gaps", () => {
    // When an identifier appears inside an expression (e.g. `count + 1`) rather
    // than as the direct child of a JsxExpression, the analyzer falls through to
    // the bottom branch and marks it as a plain Gets — *not* as forwarding —
    // even though it is being passed down.
    it("marks Gets (not forwarding) when state is wrapped in an expression on a prop", () => {
      const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return <Child label={count + 1} />;
      }
      function Child({ label }) {
        return <span>{label}</span>;
      }
    `);

      expect(root.usage).toBe(Usage.Gets);
      expect(root.children.length).toBe(0);
    });

    // The aliased spread form `<Child {...{ key: state }} />` is not tracked:
    // the bare `state` reference inside the object would be double-counted as a
    // local read, so only the shorthand `{ state }` form is forwarded (below).
    it("misses drilling for an aliased spread key ({ alias: state })", () => {
      const [root] = analyzeRoots(`
      import { useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        return <Display {...{ value: count }} />;
      }
      function Display({ value }) { return <span>{value}</span>; }
    `);
      expect(root?.children).toHaveLength(0); // FLIP when aliased spread keys are tracked
    });

    // State distributed via Context (`<Ctx.Provider value={user}>`) is a
    // deliberate scope boundary, not drilling. `Ctx.Provider` doesn't resolve to
    // a component function, so the `value={user}` read lands on the host-element
    // branch and counts as a local Get — which is correct: the state lives at the
    // provider, not drilled. What stays out of scope is the *consumer* side
    // (`useContext`), so no child is created and the state correctly reads as
    // owned here. Context is the cure for drilling, so this is the intended shape.
    it("treats a Context provider value as a local read, not a drill", () => {
      const root = analyzeRoot(`
      const Ctx = createContext(null);
      function App() {
        const [user, setUser] = useState(null);
        return (
          <Ctx.Provider value={user}>
            <Child />
          </Ctx.Provider>
        );
      }
      function Child() { return <span />; }
    `);
      expect(root.usage).toBe(Usage.Gets); // provider reads user; consumers via useContext are not modeled
      expect(root.children.length).toBe(0);
    });
  });

  describe("spread props", () => {
    // <Panel {...props} /> with `const props = { count, setCount }` forwards
    // count into Panel via the shorthand key, so the drill is detected.
    it("forwards state through a spread of a local object", () => {
      const [root] = analyzeRoots(`
      import { useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        const props = { count, setCount };
        return <Panel {...props} />;
      }
      function Panel({ count }) { return <Display count={count} />; }
      function Display({ count }) { return <span>{count}</span>; }
    `);
      expect(root?.usage).toBe(Usage.ForwardsGetter);
      expect(root?.children).toHaveLength(1);
      expect(root?.children[0]?.name).toBe("Panel");
    });

    it("forwards state through an inline object spread", () => {
      const [root] = analyzeRoots(`
      import { useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        return <Display {...{ count }} />;
      }
      function Display({ count }) { return <span>{count}</span>; }
    `);
      expect(root?.children).toHaveLength(1);
      expect(root?.children[0]?.name).toBe("Display");
      expect(root?.children[0]?.usage).toBe(Usage.Gets);
    });
  });

  describe("the children prop is composition, not drilling", () => {
    // `<Layout>{count}</Layout>` reads `count` in App (App interpolates it into
    // the JSX it returns); Layout only renders whatever ReactNode it's handed
    // via props.children. So count correctly stays local — forwarding it into
    // Layout would be a false positive. This pins that behavior.
    it("keeps state local when passed as props.children", () => {
      const [root] = analyzeRoots(`
      import { useState } from "react";
      function App() {
        const [count, setCount] = useState(0);
        return <Layout>{count}</Layout>;
      }
      function Layout({ children }) { return <div>{children}</div>; }
    `);
      expect(root?.usage).toBe(Usage.Gets);
      expect(root?.children).toHaveLength(0);
    });
  });

  // A handler prop on a *component* (`<Child onChange={(x) => setV(x)} />`) is the
  // idiomatic alternative to drilling a raw setter: the function closes over our
  // state and the child decides when to invoke it, so the symbol it carries is
  // forwarded to the child (keyed by the prop name) rather than counted as a
  // local use. The host-element form (`<button onClick={() => setV()}>`) stays a
  // local use — see "treats setter called inside a host-element event handler".
  describe("handler props (callbacks that carry state)", () => {
    // Setter referenced inside an inline arrow on a component → forwarded, and
    // marked Sets at the descendant that actually invokes the handler.
    it("forwards a setter wrapped in a handler prop into the child", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState("");
        return <Field onChange={(x) => setV(x)} />;
      }
      function Field({ onChange }) {
        return <input onChange={(e) => onChange(e.target.value)} />;
      }
    `);
      expect(root.usage).toBe(Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Field");
      expect(root.children[0]?.usage).toBe(Usage.Sets);
    });

    // Getter read inside a handler is the same shape: the descendant that invokes
    // the handler reads our state at call time, so the getter is forwarded too.
    it("forwards a getter read inside a handler prop into the child", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState("");
        return <Logger onLog={() => report(v)} />;
      }
      function Logger({ onLog }) {
        return <button onClick={onLog}>log</button>;
      }
    `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Logger");
    });

    // The state reference can sit inside a block-bodied handler, not just an
    // expression arrow — climbing out of the function still lands on the attribute.
    it("forwards a setter from a block-bodied handler", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState("");
        return <Field onChange={(x) => { setV(x); }} />;
      }
      function Field({ onChange }) {
        return <input onChange={onChange} />;
      }
    `);
      expect(root.usage).toBe(Usage.ForwardsSetter);
      expect(root.children[0]?.name).toBe("Field");
    });

    // One indirection further than the inline form: the handler is memoized in a
    // local (`const onChange = useCallback(() => setV(x), [])`) and only then
    // passed down. The binding carries the setter, so the forward — and the Sets
    // at the descendant that invokes it — match the inline-handler case exactly.
    it("forwards a setter wrapped in useCallback into the child", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState("");
        const onChange = useCallback((x) => setV(x), []);
        return <Field onChange={onChange} />;
      }
      function Field({ onChange }) {
        return <input onChange={(e) => onChange(e.target.value)} />;
      }
    `);
      expect(root.usage).toBe(Usage.ForwardsSetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("Field");
      expect(root.children[0]?.usage).toBe(Usage.Sets);
    });
  });

  // A value computed from state (`const doubled = c * 2`) is itself a carrier of
  // that state: forwarding it drills the source state into the child, keyed by the
  // prop the child receives.
  describe("derived values (computed from state) forwarded to a child", () => {
    it("follows a value derived from state forwarded to a child", () => {
      const root = analyzeRoot(`
      function App() {
        const [c, setC] = useState(0);
        const doubled = c * 2;
        return <View n={doubled} />;
      }
      function View({ n }) { return <span>{n}</span>; }
    `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(root.children.length).toBe(1);
      expect(root.children[0]?.name).toBe("View");
      expect(root.children[0]?.usage).toBe(Usage.Gets);
    });
  });

  // The counterpoint to derived values: only an *identifier*-named binding is a
  // tracked carrier. When state is read as an argument to an opaque call whose
  // result is *destructured* (or otherwise not an identifier binding), that read
  // is a genuine local use — the binding doesn't carry the state onward — so the
  // state stays put rather than being "drilled" into a child it's also passed to.
  describe("local reads that are not carriers stay local", () => {
    // Regression for a real excalidraw false positive (`exportSelectionOnly` was
    // reported as drilled into a shared <Switch/> even though it's read locally to
    // build the export payload). `prepare(sel)` reads sel here-and-now.
    it("treats a state read inside a destructured opaque call as a local use", () => {
      const root = analyzeRoot(`
      function App() {
        const [sel, setSel] = useState(false);
        const { out } = prepare(sel);
        return <div>{out}<Switch checked={sel} onChange={(c) => setSel(c)} /></div>;
      }
      function Switch({ checked, onChange }) {
        return <input checked={checked} onChange={onChange} />;
      }
    `);
      // sel is read locally in prepare(sel) → a Get here, not solely a forward
      expect(root.usage & Usage.Gets).toBe(Usage.Gets);
      // …so it stays in App rather than being lifted into Switch
      expect(retrieveClosestCommonParentFromRoot(root)).toBe(root);
    });
  });

  // DEFERRED GAP (it.failing): a value derived from state *through a destructuring
  // binding* is still a carrier — same as `const doubled = v * 2` — but the binding
  // name isn't a plain identifier, the one shape growTrackedBindings skips, so the
  // forward is missed (false negative). Tracked here; lower priority than shared
  // components. Flip to `it` when growTrackedBindings learns destructure patterns.
  describe("carriers through destructuring", () => {
    it.failing("follows an object-destructured field forwarded to a child", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState({ k: 1 });
        const { k } = v;
        return <Child k={k} />;
      }
      function Child({ k }) { return <span>{k}</span>; }
    `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(retrieveClosestCommonParentFromRoot(root).name).toBe("Child");
      expect(root.children[0]?.usage).toBe(Usage.Gets);
    });

    it.failing("follows a field destructured from an opaque call on state", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState(0);
        const { x } = wrap(v);
        return <Child x={x} />;
      }
      function Child({ x }) { return <span>{x}</span>; }
    `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(retrieveClosestCommonParentFromRoot(root).name).toBe("Child");
      expect(root.children[0]?.usage).toBe(Usage.Gets);
    });

    it.failing("follows an array-destructured element forwarded to a child", () => {
      const root = analyzeRoot(`
      function App() {
        const [v, setV] = useState(0);
        const [x] = [v];
        return <Child x={x} />;
      }
      function Child({ x }) { return <span>{x}</span>; }
    `);
      expect(root.usage).toBe(Usage.ForwardsGetter);
      expect(retrieveClosestCommonParentFromRoot(root).name).toBe("Child");
      expect(root.children[0]?.usage).toBe(Usage.Gets);
    });
  });
});

describe("retrieveClosestCommonParentFromRoot — where to lift state up", () => {
  it("should be CounterPanel since App only forwards count down a single branch", () => {
    const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);
      return (
        <CounterPanel count={count} setCount={setCount} />
      );
    }

    function CounterPanel({ count, setCount }) {
      return (
        <section>
          <CounterDisplay count={count} />
          <CounterControls setCount={setCount} />
        </section>
      );
    }

    function CounterDisplay({ count }) {
      return <span>count is {count}</span>;
    }

    function CounterControls({ setCount }) {
      return (
        <div>
          <IncrementButton setCount={setCount} />
          <ResetButton setCount={setCount} />
        </div>
      );
    }

    function IncrementButton({ setCount }) {
      return <button onClick={() => setCount((c) => c + 1)}>+1</button>;
    }

    function ResetButton({ setCount }) {
      return <button onClick={() => setCount(0)}>reset</button>;
    }
  `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("CounterPanel");
  });

  it("should be Counter when state is drilled straight down through several components", () => {
    const root = analyzeRoot(`
    function App() {
      const [count, setCount] = useState(0);

      return (
        <Layout>
          <MainPanel count={count} setCount={setCount} />
        </Layout>
      );
    }

    function Layout({ children }) {
      return <div className="layout">{children}</div>;
    }

    function MainPanel({ count, setCount }) {
      return (
        <section>
          <CounterSection count={count} setCount={setCount} />
        </section>
      );
    }

    function CounterSection({ count, setCount }) {
      return (
        <div>
          <CounterControls count={count} setCount={setCount} />
        </div>
      );
    }

    function CounterControls({ count, setCount }) {
      return (
        <div>
          <Counter count={count} setCount={setCount} />
        </div>
      );
    }

    function Counter({ count, setCount }) {
      return (
        <div>
          <CounterDisplay count={count} />
          <button onClick={() => setCount((c) => c + 1)}>+1</button>
        </div>
      );
    }

    function CounterDisplay({ count }) {
      return <span>count is {count}</span>;
    }
  `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("Counter");
  });

  // The root component is its own consumer, so the common parent is the root.
  it("returns the root when state is consumed in the declaring component", () => {
    const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return (
          <div>
            <span>{count}</span>
            <button onClick={() => setCount((c) => c + 1)}>+1</button>
          </div>
        );
      }
    `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("App");
  });

  // Nothing consumes the state anywhere; the helper falls back to the root.
  it("returns the root when no node consumes the state", () => {
    const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return <div>hello</div>;
      }
    `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("App");
  });

  // The first node with two children is treated as the common parent, even if neither
  // sibling reads state directly at that level.
  it("returns the first forking node when state branches to siblings", () => {
    const root = analyzeRoot(`
      function App() {
        const [count, setCount] = useState(0);
        return (
          <Middle count={count} setCount={setCount} />
        );
      }
      function Middle({ count, setCount }) {
        return (
          <>
            <Display count={count} />
            <Controls setCount={setCount} />
          </>
        );
      }
      function Display({ count }) {
        return <span>{count}</span>;
      }
      function Controls({ setCount }) {
        return <button onClick={() => setCount(0)}>r</button>;
      }
    `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("Middle");
  });

  it("handles the jsx as props pattern", () => {
    const root = analyzeRoot(`
      function Box(props: { d: React.ReactNode; children: React.ReactNode }) {
        return <div>{props.children}</div>;
      }

      export function App() {
        const [n] = useState(0);
        return (
          <Box d={<span>{n}</span>}>
            <div />
          </Box>
        );
      }
    `);

    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("App");
  });

  it("computes the closest common parent for an arrow component that drills through a middle layer", () => {
    const [root] = analyzeRoots(`
      const App = () => {
        const [count, setCount] = useState(0);
        return <Middle count={count} setCount={setCount} />;
      };
      function Middle({ count, setCount }) {
        return (
          <>
            <Display count={count} />
            <Controls setCount={setCount} />
          </>
        );
      }
      function Display({ count }) {
        return <span>{count}</span>;
      }
      function Controls({ setCount }) {
        return <button onClick={() => setCount(0)}>r</button>;
      }
    `);
    if (!root) throw new Error("expected a root");
    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("Middle");
  });

  // `name` is drilled into Field, whose only consumption is a host-element
  // attribute (`<input value={name}/>`). Now that host-attr reads count as a use,
  // Field registers as the real consumer and the state lifts to Field rather than
  // looking like it lives unused at the declaring component.
  it("lifts to the child that consumes state through a host-element attribute", () => {
    const root = analyzeRoot(`
      function App() {
        const [name, setName] = useState("");
        return <Field name={name} />;
      }
      function Field({ name }) {
        return <input value={name} readOnly />;
      }
    `);
    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("Field");
  });

  // `bio` is forwarded to Preview (the real consumer) *and* referenced inside an
  // `onSave` handler App passes down — App never renders bio itself. Now that the
  // handler reference is a forward (not a local read), the early-return no longer
  // fires and the drill into Preview is reported. This was the dominant
  // false-negative on real apps: an owner referencing its own state only to build
  // a prop/handler for a child.
  it("lifts past a parent that only references state inside a down-passed handler", () => {
    const root = analyzeRoot(`
      function App() {
        const [bio, setBio] = useState("");
        return <Preview bio={bio} onSave={() => save(bio)} />;
      }
      function Preview({ bio, onSave }) {
        return <span>{bio}</span>;
      }
    `);
    const commonParent = retrieveClosestCommonParentFromRoot(root);
    expect(commonParent.name).toBe("Preview");
  });
});

// The lift target excludes shared components: you can never move a useState into a
// component rendered in more than one place (it would fork the state across every
// render site and sever the owner that drives it). The fix walks the common parent
// up to the nearest singular ancestor — or, if there isn't one, leaves the state put.
describe("lift target excludes shared components", () => {
  // `Badge` is the sole consumer of `v`, but it's rendered in two places, so it's
  // not a valid home. Walking up lands on the owner → not drilled. (This is the
  // excalidraw copyStatus → FilledButton false positive, distilled.)
  it("does not lift state into a component rendered in multiple places", () => {
    const r = liftResult(`
      function App() {
        const [v, setV] = useState(0);
        return <Badge value={v} />;
      }
      function Other() { return <Badge value={1} />; }
      function Badge({ value }) { return <span>{value}</span>; }
    `);
    expect(r.drilled).toBe(false);
    expect(r.target).toBe("App");
  });

  // Single-use consumer is a genuine, safe lift target — don't over-suppress.
  // (This is the excalidraw selectedItems → LibraryMenuItems true positive.)
  it("still lifts into a single-use consumer", () => {
    const r = liftResult(`
      function App() {
        const [v, setV] = useState(0);
        return <Panel value={v} />;
      }
      function Panel({ value }) { return <span>{value}</span>; }
    `);
    expect(r.drilled).toBe(true);
    expect(r.target).toBe("Panel");
  });

  // Genuinely drilled through a chain to a *shared* leaf: lift to the nearest
  // singular ancestor (Mid), not into the shared leaf (Leaf).
  it("lifts to the nearest singular ancestor when the consumer is shared", () => {
    const r = liftResult(`
      function App() {
        const [v, setV] = useState(0);
        return <Mid value={v} />;
      }
      function Mid({ value }) { return <Leaf value={value} />; }
      function Other() { return <Leaf value={1} />; }
      function Leaf({ value }) { return <span>{value}</span>; }
    `);
    expect(r.drilled).toBe(true);
    expect(r.target).toBe("Mid");
  });
});
