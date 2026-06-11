# react-driller

I'm tired of agents mindlessly prop drilling. This is the first step towards fixing it for good.

Run react-driller and it tells you where your useState should live. You can use it. Your agent can use it (to combat the propensity to drill props needlessly)

## Usage

`npx react-driller src/App.tsx`

and you get output like:

```
move: `theme` from App src/App.tsx:5:3 to ThemeToggle src/Toolbar.tsx:12:1
✓ checked `count` src/App.tsx:6:3
```

thanks for checking it out <3

## What doesn't work yet and is on roadmap (0.1.0)

- Barrel re-exports (`export { Foo } from "./foo"`)
- Default exports, esp. wrapped (`export default memo(Foo)`, `forwardRef`)
- Namespaced JSX (`<motion.div>`)
- `node_modules` components (will try to drill in)
