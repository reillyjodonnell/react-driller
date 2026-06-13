# react-driller

I'm tired of agents mindlessly prop drilling. This is the first step towards fixing it for good.

Run react-driller and it tells you where your useState should live. You can use it. Your agent can use it (to combat the propensity to drill props needlessly)

## Usage

`npx react-driller src/App.tsx`

Each path may be a file or a directory. Directories are walked recursively for `.tsx` and `.jsx` files (ignoring `node_modules`, `dist`, `build`, `.next`, `.git`, `coverage`, `.turbo`, and `.cache`).

### Flags

| Flag | Description |
| --- | --- |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Print version. |
| `--json` | Emit machine-readable output: exactly one JSON object on stdout and nothing else (no colors, no extra logs). |
| `--fail-on <level>` | Set the exit code based on findings. See levels below. |
| `--diff [base]` | Scan only files that git reports as changed versus `base` (default `main`). |

#### `--json`

Prints a single JSON object describing every scanned file, its components, and each piece of `useState` it owns. Each state reports whether it is `drilled` and, when it is, the `suggestedAncestor` where it should live. A top-level `summary` carries the aggregate counts.

```
$ react-driller --json src/App.tsx
```

```json
{
  "files": [
    {
      "file": "src/App.tsx",
      "components": [
        {
          "name": "App",
          "location": { "file": "src/App.tsx", "line": 2, "column": 30 },
          "states": [
            {
              "name": "theme",
              "location": { "file": "src/App.tsx", "line": 2, "column": 30 },
              "drilled": true,
              "suggestedAncestor": {
                "name": "ThemeToggle",
                "location": { "file": "src/App.tsx", "line": 11, "column": 1 }
              }
            }
          ]
        }
      ]
    }
  ],
  "summary": { "filesScanned": 1, "statesFound": 1, "drillingFindings": 1 }
}
```

All `file` fields (top-level and inside every `location`) are repo-relative, never absolute.

#### `--fail-on <level>`

Controls the process exit code so react-driller can gate a commit or CI run.

| Level | Behavior |
| --- | --- |
| `none` (default) | Always exit `0`. Preserves the default behavior. |
| `findings` | Exit `1` when there is at least one drilling finding (a `useState` whose least-common-ancestor differs from the component that declares it); otherwise exit `0`. |

An unrecognized level prints a clear error to stderr and exits `1`.

```
$ react-driller --fail-on findings src/
$ echo $?
1
```

`--fail-on` composes with `--json`: the exit code is still set from the findings count while stdout stays a single JSON object.

#### `--diff [base]`

Restricts the scan to `.tsx`/`.jsx` files that git reports as changed versus a base ref (default `main`), respecting the same ignored-directory rules as a directory walk. Pass a base ref after the flag to compare against it instead:

```
$ react-driller --diff            # changed files vs main
$ react-driller --diff develop    # changed files vs develop
```

If positional paths are also given, the changed set is intersected with those paths (only changed files under the given roots are scanned). If git is unavailable, the directory is not a git repository, or the base ref is invalid, react-driller prints a clear error to stderr and exits `1`.

### Gate a commit with husky + lint-staged

Run react-driller as a pre-commit check so a commit that introduces prop drilling fails before it lands. `lint-staged` passes the staged (changed) file paths as arguments to each command, so react-driller scans exactly the files in the commit. Pair it with `--fail-on findings` to fail the commit on any drilling finding.

Install the dev dependencies and the husky hook:

```
npm install --save-dev husky lint-staged
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

Configure `lint-staged` (in `package.json` or `.lintstagedrc.json`) to run react-driller on changed `.tsx`/`.jsx` files:

```json
{
  "lint-staged": {
    "*.{tsx,jsx}": "react-driller --fail-on findings"
  }
}
```

`lint-staged` appends the matched changed file paths to the command, so the example above runs `react-driller --fail-on findings <changed-files>` and aborts the commit (exit `1`) whenever a staged file drills state.

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
