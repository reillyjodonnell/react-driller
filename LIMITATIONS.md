# Known limitations

react-driller is a static analyzer (sort of): it reads your source and follows `useState` /
`useReducer` through props across files. Not yet supported react patterns fall into 3 buckets: **planned** (we intend to support these), **out of scope** (deliberately not planned), and **gotchas** (cases where the output can
mislead you).

For supported React patterns, see the table in the [README](./README.md#supported).

## Planned 🚧

- **Custom hooks that own state** — `const [v, setV] = useToggle()`. Only literal
  `useState` / `useReducer` are recognized as roots. This is actively being worked on.
- **Handler props** — `<Field onChange={(x) => setV(x)} />`. The setter is read
  inside the handler, so it's counted as a local use rather than followed into
  the child.
- **Derived values passed down** — `const x = v * 2; <Child x={x} />`. The derived
  value isn't tied back to its source state, so the drill of `v` is missed.
- **Rest-spread pass-through** — `function W({ ...rest }) { return <Inner {...rest} /> }`.
  Common in wrapper / design-system components; the forwarded `...rest` isn't
  traced onward.

## Out of scope —

Patterns that aren't prop drilling, or are too rare to be worth the complexity.

- **Context / external stores** (Redux, Zustand, Jotai, …) — these are the _cure_
  for drilling, not drilling. A `<Ctx.Provider value={v}>` is read as a local use;
  consumers via `useContext` / store hooks aren't modeled.
- **Other state primitives** — `useRef`, `useSyncExternalStore`.
- **Class components** — `extends React.Component`.
- **Render props / children-as-function** — `<Wrap>{(x) => <Inner v={v} />}</Wrap>`.
- **Namespaced JSX** — `<motion.div>`, `<Foo.Bar>`.
- **Barrel re-exports** — `export { Foo } from "./foo"`.
- **Anonymous default exports** — `export default () => {}`, `export default memo(() => ...)`
  (no name to attribute state to).
- **HOC calls with no inline render function** — `const Made = makeFoo()`. The
  component lives inside `makeFoo`, so there's nothing local to attribute state to
  (unlike `memo(() => ...)`, where the render function is right there).
- **Dynamically-chosen tags** — `const Cmp = cond ? A : B; <Cmp />`.
- **Non-array destructure** — `const s = useState(0); s[0]`.
- **lowercase-named custom components** — these read as host elements.

## Gotchas ⚠️

- **`node_modules` components** — state from node*modules e.g. tanstack/query is indistringuishable from react-driller's perspective. Be wary that it **can** appear in results until remedied.
  `node_modules`, but an \_import* from one is still followed. Keep your own
  components in your source tree.
