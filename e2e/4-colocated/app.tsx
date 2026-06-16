import { useState } from "react";

// `count` is declared and used in the same component, so its least-common
// ancestor is App itself — no prop drilling. Used as the "no findings" case.
export function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>clicked {count}</button>;
}
