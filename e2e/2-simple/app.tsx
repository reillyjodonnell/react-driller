import { useState } from "react";

export function App() {
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
