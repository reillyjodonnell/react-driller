import { useState } from "react";

let count;

function Parent() {
  const [count, setCount] = useState(0);
  return <Counter count={count} />;
}

function Counter({ count }) {
  function wow() {}
  return <button>{count}</button>;
}

function shouldNotAppear() {
  return;
}
