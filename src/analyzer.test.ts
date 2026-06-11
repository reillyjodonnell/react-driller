import { describe, it, expect } from "bun:test";
import {
  createDrillerNode,
  createRootDrillerNode,
  Usage,
  type DrillerNode,
  type DrillerRoot,
} from "./node";
import ts from "typescript";
import { createFixture } from "./test-utils";
import {
  retrieveLeastCommonAncestorFromRoot,
  scanNode,
  useStateExtractor,
} from "./analyzer";

describe("state flow tree", () => {
  it("represents a basic prop-drilling path", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
    function App() {
      const [count, setCount] = useState(0);
      return null;
    }
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);

    expect(root).toBeDefined();
    expect(root?.getter).not.toBeUndefined();
    expect(root?.setter).not.toBeUndefined();
    expect(root?.name).toBe("App");
  });

  it("accounts for using a value / setting and distinguishes from merely passing props", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
    function App() {
      const [count, setCount] = useState(0);
      return  (
      <Child count={count} />
      );
    }

    function Child({count}){
      return null
    }
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    console.log(root?.getter.entries.length);

    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    expect(root.usage).toBe(Usage.ForwardsGetter);
  });

  it("distinguishes between reading and forwarding as props", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
    function App() {
      const [count, setCount] = useState(0);
      return (
      <button> {count} </button>
      );
    }
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    expect(root.usage).not.toBe(Usage.ForwardsGetter);
    expect(root.usage).toBe(Usage.Gets);
  });

  /// child relationships
  it("adds child when detects props", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
    function App() {
      const [count, setCount] = useState(0);
      return  (
      <Child count={count} />
      );
    }

    function Child({count}){
      return null
    }

  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }
    expect(root.usage).toBe(Usage.ForwardsGetter);
    expect(root.children.length).toBe(1);
  });

  it("tracks symbol across component (function) jump", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
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
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    let queue = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    expect(root.children.length).toBe(1);
    const child = root.children[0];
    expect(child?.children.length).toBe(1);

    expect(root.children[0]?.usage).toStrictEqual(
      Usage.Gets | Usage.ForwardsGetter,
    );
    expect(child?.children[0]?.usage).toStrictEqual(Usage.Gets);
  });

  it("should detect components that return children from props e.g. slot components", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
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

   
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    expect(root.children.length).toBe(1);
  });

  it("should detect setter usage from a child", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
    function App() {
      const [count, setCount] = useState(0);
      return <Child setCount={setCount} />;
    }

    function Child({ setCount }) {
      return <button onClick={() => setCount((c) => c + 1)}>+1</button>;
    }
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    expect(root.children.length).toBe(1);
    const child = root.children[0];
    expect(child?.name).toBe("Child");
    expect(child?.usage).toBe(Usage.Sets);
  });
});

describe("can find the least common ancestor across a tree of Driller nodes", () => {
  it("should be CounterPanel since App only forwards count down a single branch", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
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
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    const lca = retrieveLeastCommonAncestorFromRoot(root);
    expect(lca.name).toBe("CounterPanel");
  });

  it("should be Counter when state is drilled straight down through several components", () => {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source: `
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
  `,
    });

    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("No-op should resolve to a root for this test");
    const queue: Array<DrillerRoot | DrillerNode> = [root];
    console.log(root.children.length);

    while (queue.length) {
      const node = queue.shift();
      if (node) {
        scanNode(node, checker, queue);
      }
    }

    const lca = retrieveLeastCommonAncestorFromRoot(root);
    expect(lca.name).toBe("Counter");
  });
});

/**
 * Edge cases that probe how the analyzer treats common JSX / React shapes.
 *
 * Each test documents a single behavior. When a test asserts something that
 * looks "wrong" (e.g. usage being Gets when intuitively the prop was forwarded),
 * the docstring explains why that is the *current* behavior — the analyzer
 * only recognizes forwarding when an identifier is the direct child of a
 * JsxExpression sitting on a JsxAttribute / self-closing element.
 */
describe("JSX / React edge cases", () => {
  function drive(source: string) {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source,
    });
    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("expected a root for this fixture");
    const queue: Array<DrillerRoot | DrillerNode> = [root];
    while (queue.length) {
      const node = queue.shift();
      if (node) scanNode(node, checker, queue);
    }
    return root;
  }

  // Renaming during destructure on the *child* side: `{ count: c }`.
  // matchPropBinding uses `propertyName` as the prop key and `name` as the
  // local binding, so subsequent uses of `c` resolve back to the parent's
  // `count` symbol.
  it("follows renamed destructure in the child param ({ count: c })", () => {
    const root = drive(`
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

  // A setter invoked inside an event handler attached to a *host* element
  // (lowercase `button`) counts as a Set on the enclosing component — not as
  // forwarding — because the call expression sits above the identifier, so
  // `node.parent` is a CallExpression rather than a JsxExpression.
  it("treats setter called inside a host-element event handler as Sets", () => {
    const root = drive(`
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

  // When the same component receives both getter and setter as two separate
  // attributes, scanNode must dedupe the child rather than creating one
  // DrillerNode per attribute.
  it("dedupes a child when both getter and setter are forwarded as separate props", () => {
    const root = drive(`
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
    const root = drive(`
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

  // State referenced inside a JSX fragment's text content (not in any
  // attribute position) should be marked as Gets, mirroring the
  // `<button>{count}</button>` case but using a `<>...</>` wrapper.
  it("marks Gets for state inside JSX fragment text content", () => {
    const root = drive(`
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

  // Current limitation worth pinning down: when an identifier appears inside
  // an expression (e.g. `count + 1`) rather than as the direct child of a
  // JsxExpression, the analyzer falls through to the bottom branch and marks
  // it as a plain Gets — *not* as forwarding — even though it is being passed
  // down. If this changes, this test should be updated.
  it("marks Gets (not forwarding) when state is wrapped in an expression on a prop", () => {
    const root = drive(`
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

  // When useState exists but nothing in the component body references the
  // bindings, usage stays at Usage.None and no children are produced.
  it("leaves usage as None when state is declared but never used", () => {
    const root = drive(`
      function App() {
        const [count, setCount] = useState(0);
        return <div>hello</div>;
      }
    `);

    expect(root.usage).toBe(Usage.None);
    expect(root.children.length).toBe(0);
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
      const root = drive(`
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
    const root = drive(`
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
});

/**
 * Additional LCA scenarios. The LCA helper short-circuits to the root when
 * the root itself consumes state, and otherwise descends until it sees a fork
 * (>= 2 children) or a consumer.
 */
describe("LCA edge cases", () => {
  function build(source: string) {
    const { sourceFile, checker } = createFixture({
      fileName: "app.tsx",
      source,
    });
    const [root] = useStateExtractor(sourceFile, checker);
    if (!root) throw new Error("expected a root for this fixture");
    const queue: Array<DrillerRoot | DrillerNode> = [root];
    while (queue.length) {
      const node = queue.shift();
      if (node) scanNode(node, checker, queue);
    }
    return root;
  }

  // The root component is its own consumer, so LCA returns the root.
  it("returns the root when state is consumed in the declaring component", () => {
    const root = build(`
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

    const lca = retrieveLeastCommonAncestorFromRoot(root);
    expect(lca.name).toBe("App");
  });

  // Nothing consumes the state anywhere; the helper falls back to the root.
  it("returns the root when no node consumes the state", () => {
    const root = build(`
      function App() {
        const [count, setCount] = useState(0);
        return <div>hello</div>;
      }
    `);

    const lca = retrieveLeastCommonAncestorFromRoot(root);
    expect(lca.name).toBe("App");
  });

  // The first node with two children is treated as the LCA, even if neither
  // sibling reads state directly at that level.
  it("returns the first forking node when state branches to siblings", () => {
    const root = build(`
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

    const lca = retrieveLeastCommonAncestorFromRoot(root);
    expect(lca.name).toBe("Middle");
  });
});
