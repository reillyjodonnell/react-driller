function App() {
  const [count, setCount] = useState(0);

  return <Counter count={count} setCount={setCount} />;
}

function Counter({ count, setCount }) {
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
