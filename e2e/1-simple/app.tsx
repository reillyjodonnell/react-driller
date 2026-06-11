import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState("light");

  return (
    <>
      <Toolbar theme={theme} setTheme={setTheme} />
      <CounterPanel count={count} setCount={setCount} />
      <Footer count={count} />
    </>
  );
}

function Layout({ theme, children }) {
  return (
    <div data-theme={theme}>
      <Header theme={theme} />
      {children}
    </div>
  );
}

function Header({ theme }) {
  return <h1>App ({theme})</h1>;
}

function Toolbar({ theme, setTheme }) {
  return (
    <div>
      <ThemeToggle theme={theme} setTheme={setTheme} />
    </div>
  );
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      toggle theme ({theme})
    </button>
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

function Footer({ count }) {
  return <footer>total clicks so far: {count}</footer>;
}

function UnrelatedSibling() {
  return <p>I do not touch any state.</p>;
}
