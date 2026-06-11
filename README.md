# react-driller

I'm tired of agents mindlessly prop drilling. This is the first step towards fixing it for good.

Run react-driller and it tells you where your useState should live. You can use it. Your agent can use it (to combat the propensity to drill props needlessly)

## Usage

`npx react-driller src/App.tsx`

### Super small example

Experiencing prop drilling hell? Imagine this but in the scale of an actual app:

```tsx
// src/App.tsx
function App() {
  const [theme, setTheme] = useState("light");
  return <Toolbar theme={theme} setTheme={setTheme} />;
}

function Toolbar({ theme, setTheme }) {
  return <ThemeToggle theme={theme} setTheme={setTheme} />;
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      {theme}
    </button>
  );
}
```

...

Run the cli:

```
$ npx react-driller src/App.tsx

  App  src/App.tsx:2:30

    src/App.tsx:2:30  `theme`  App → ThemeToggle  src/App.tsx:11:1
```

And your agent can fix it

```
  ThemeToggle  src/App.tsx:11:30

    src/App.tsx:11:30  `theme`  ✓ in ThemeToggle
```

thanks for checking it out <3

## What doesn't work yet and is on roadmap (0.1.0)

- Barrel re-exports (`export { Foo } from "./foo"`)
- Default exports, esp. wrapped (`export default memo(Foo)`, `forwardRef`)
- Namespaced JSX (`<motion.div>`)
- `node_modules` components (will try to drill in)
