import { debuglog } from "node:util";
import ts from "typescript";
import { createDrillerNode, hasGetOrSet, Usage, type DrillerNode, type DrillerRoot } from "./node";

// Opt-in diagnostics: no-op unless NODE_DEBUG=driller is set.
// Each call marks a shape the analyzer can't handle and skips it instead of
// crashing — run with the env var to see where coverage leaks. See CONTRIBUTING.md.
const debug = debuglog("driller");

function nodeLoc(node: ts.Node): string {
  const sf = node.getSourceFile();
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${sf.fileName}:${line + 1}:${character + 1}`;
}

/// analyzer produces a driller tree
export function useStateExtractor(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): DrillerRoot[] {
  const roots: DrillerRoot[] = [];
  const stateHookNames = collectStateHookNames(sourceFile);

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isStateHookCall(node, stateHookNames)) {
      if (ts.isVariableDeclaration(node.parent) && ts.isArrayBindingPattern(node.parent.name)) {
        const [valueBinding, setterBinding] = node.parent.name.elements;

        if (
          valueBinding &&
          ts.isBindingElement(valueBinding) &&
          ts.isIdentifier(valueBinding.name)
        ) {
          const valueSymbol = checker.getSymbolAtLocation(valueBinding.name);

          let maybeSetterSymbol: ts.Symbol | undefined;

          if (
            setterBinding &&
            ts.isBindingElement(setterBinding) &&
            ts.isIdentifier(setterBinding.name)
          ) {
            maybeSetterSymbol = checker.getSymbolAtLocation(setterBinding.name);
          }
          const componentOwner = getEnclosingComponentFunction(node);

          // A useState whose enclosing component can't be resolved (e.g. a
          // top-level module call, or a call inside a non-component function
          // we don't model) is a shape we can't classify rather than a bug.
          // Skip this occurrence and keep walking the AST instead of aborting
          // the whole scan.
          const ownerSymbol = componentOwner
            ? getFunctionOwnerSymbol(componentOwner, checker)
            : undefined;
          if (!componentOwner) {
            // e.g. useState inside a custom hook (camelCase, not a component)
            debug("skip: useState with no enclosing component — %s", nodeLoc(node));
            ts.forEachChild(node, (child) => visit(child));
            return;
          }

          if (componentOwner && ownerSymbol && valueSymbol) {
            const sourceFile = node.getSourceFile();
            const pos = node.getStart(sourceFile);
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);

            roots.push({
              children: [],
              name: ownerSymbol.getName(),
              parent: null,
              setter: maybeSetterSymbol ? new Set([maybeSetterSymbol]) : new Set(),
              getter: new Set([valueSymbol]),
              source: {
                column: character + 1,
                file: sourceFile.fileName,
                line: line + 1,
              },
              type: "root",
              usage: Usage.None,
              ownerComponentFunction: componentOwner,
              jsxElement: null,
            });
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child));
  }
  visit(sourceFile);

  return roots;
}

// React state-producing hooks whose `[value, setter]` tuple the analyzer
// models. useReducer's `[state, dispatch]` has the same array shape — dispatch
// plays the setter's role — so both flow through the extractor identically.
const STATE_HOOKS = new Set(["useState", "useReducer"]);

function isStateHookCall(node: ts.CallExpression, hookNames: Set<string>): boolean {
  // R.useState(...) / React.useReducer(...): match on the property name.
  // Namespace and default imports both land here.
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    STATE_HOOKS.has(node.expression.name.text)
  ) {
    return true;
  }
  if (!ts.isIdentifier(node.expression)) return false;
  return hookNames.has(node.expression.text);
}

// One pass over the source file: collect every identifier that refers to one
// of React's state hooks (useState / useReducer) in this file, accounting for
// import renames and local re-bindings. Cheaper than a per-call symbol lookup —
// the call-site check is then a Set hit.
function collectStateHookNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>(STATE_HOOKS);
  const shadowed = new Set<string>();

  function visit(node: ts.Node) {
    // import { useState [as X], useReducer [as Y] } from "react"  →  local names
    if (ts.isImportDeclaration(node) && node.importClause) {
      const named = node.importClause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const spec of named.elements) {
          const original = (spec.propertyName ?? spec.name).text;
          if (STATE_HOOKS.has(original)) names.add(spec.name.text);
        }
      }
    }
    // function useState(...) {}  →  a local declaration shadows the hook
    if (ts.isFunctionDeclaration(node) && node.name && STATE_HOOKS.has(node.name.text)) {
      shadowed.add(node.name.text);
    }
    // const u = useState  →  pick up the re-binding
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      names.has(node.initializer.text)
    ) {
      if (STATE_HOOKS.has(node.name.text)) shadowed.add(node.name.text);
      else names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const name of shadowed) names.delete(name);
  return names;
}

type ComponentFn = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function isComponentFn(n: ts.Node): n is ComponentFn {
  if (!(ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) {
    return false;
  }
  // require a PascalCase name to count as a component
  const name = getFunctionName(n);
  return name !== undefined && isPascalCase(name);
}

// The identifier that names this component: the variable it's bound to
// (through any memo()/forwardRef() wrapper), or the function's own name for a
// declaration / named function expression. The display name (.text) and the
// owner symbol are both read off this one identifier, so the two can't drift.
function maybeComponentNameIdentifier(fn: ComponentFn): ts.Identifier | undefined {
  // read through any memo()/forwardRef() wrapper to the bound variable
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const binding = maybeBindingThroughHOCWrapper(fn);
    if (binding) return binding;
  }
  // function App() {...}  → fn.name is the Identifier "App"
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name;
  // named function expression with no outer binding (rare)
  if (ts.isFunctionExpression(fn) && fn.name) return fn.name;
  return undefined;
}

function getFunctionName(fn: ComponentFn): string | undefined {
  return maybeComponentNameIdentifier(fn)?.text;
}

// A "binding" is a named thing e.g. the `App` in `const App = () => {};`.
// Climb from an arrow/function-expression past any HOC call wrappers
// (memo, forwardRef, observer, …) to the variable declaration that binds it
// (const/let/var), and return that binding's identifier, so a component
// written as `const App = memo(() => {...})` resolves to "App".
function maybeBindingThroughHOCWrapper(fn: ts.Node): ts.Identifier | undefined {
  let current: ts.Node = fn.parent;
  while (current && ts.isCallExpression(current)) {
    current = current.parent;
  }
  if (current && ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
    return current.name;
  }
  return undefined;
}

export function scanNode(
  current: DrillerRoot | DrillerNode,
  checker: ts.TypeChecker,
  queue: Array<DrillerRoot | DrillerNode>,
) {
  const fn = current.ownerComponentFunction;

  // <Child {...props} /> — resolve the spread to the object it forwards and
  // route any of this state's getter/setter it carries to the child, keyed by
  // the property the child destructures. Covers an inline `{...{ count }}` and
  // a local `const props = { count }; <Child {...props} />`.
  function forwardSpread(spread: ts.JsxSpreadAttribute) {
    const object = resolveSpreadObject(spread.expression, checker);
    if (!object) {
      debug("skip: spread is not a statically-resolvable object — %s", nodeLoc(spread));
      return;
    }
    const jsxOpeningElement = spread.parent.parent;
    const childComponent = resolveComponentFn(jsxOpeningElement.tagName, checker);
    for (const prop of object.properties) {
      const entry = spreadPropEntry(prop, checker);
      if (!entry) continue;
      const getterMatch = current.getter.has(entry.valueSymbol);
      const setterMatch = current.setter.has(entry.valueSymbol);
      if (!getterMatch && !setterMatch) continue;
      if (!childComponent) {
        // spread onto a host element → the state is used here
        if (getterMatch) current.usage |= Usage.Gets;
        if (setterMatch) current.usage |= Usage.Sets;
        continue;
      }
      recordSymbolRemapToChild(
        childComponent,
        jsxOpeningElement,
        entry.keyName,
        getterMatch,
        setterMatch,
        spread,
      );
    }
  }

  // Find this child's existing node (deduped by its JSX usage site) or create and
  // enqueue a new one. Named by the component's own name, falling back to the JSX
  // tag the consumer wrote — `const C = () => {}` and `memo(() => {})` have no
  // function name, so the tag keeps the component's real name.
  function findOrCreateChildNode(
    childComponent: ComponentFn,
    jsxOpeningElement: ts.JsxOpeningLikeElement,
  ): DrillerNode | undefined {
    const existing = current.children.find((child) => child.jsxElement === jsxOpeningElement);
    if (existing) return existing;

    const tagName = jsxOpeningElement.tagName;
    const name =
      childComponent.name?.text ?? (ts.isIdentifier(tagName) ? tagName.text : tagName.getText());
    if (!name) {
      debug("skip: child component has no resolvable name — %s", nodeLoc(jsxOpeningElement));
      return undefined;
    }

    const sourceFile = childComponent.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      childComponent.getStart(sourceFile),
    );
    const child = createDrillerNode({
      name,
      parent: current,
      ownerComponentFunction: childComponent,
      jsxElement: jsxOpeningElement,
      source: { file: sourceFile.fileName, line: line + 1, column: character + 1 },
    });
    current.children.push(child);
    queue.push(child);
    return child;
  }

  // The tracked state crosses into the child under a *new symbol* — its prop
  // parameter — so record that remap: resolve the child's symbol for `propName`
  // and attach it to the child's node. (React: App passes this state to Child as
  // a prop.) Getter and setter arrive as separate calls for the same element and
  // converge on one (deduped) child node.
  function recordSymbolRemapToChild(
    childComponent: ComponentFn,
    jsxOpeningElement: ts.JsxOpeningLikeElement,
    propName: string,
    getterMatch: boolean,
    setterMatch: boolean,
    node: ts.Node,
  ) {
    const childPropSymbol = matchPropBinding(childComponent, propName, checker);
    if (!childPropSymbol) {
      debug("skip: prop %s didn't resolve to a child binding — %s", propName, nodeLoc(node));
      return;
    }

    const child = findOrCreateChildNode(childComponent, jsxOpeningElement);
    if (!child) return;

    if (getterMatch) {
      child.getter.add(childPropSymbol);
      current.usage |= Usage.ForwardsGetter;
    }
    if (setterMatch) {
      child.setter.add(childPropSymbol);
      current.usage |= Usage.ForwardsSetter;
    }
  }

  // Record one reference to the tracked state inside this component: either it's
  // passed to a child (forwarded) or it's used right here.
  function recordStateReference(node: ts.Identifier) {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return;

    const isValue = current.getter.has(symbol);
    const isSetter = current.setter.has(symbol);
    if (!isValue && !isSetter) return;

    // skip the value/setter binding in the useState declaration itself
    if (ts.isBindingElement(node.parent) && node.parent.name === node) return;

    // State leaves this component only on a JSX attribute of a *child component*,
    // either directly (`<Child v={state} />`) or via a handler that closes over it
    // (`<Child onX={() => setState()} />`). Anything else — rendered output
    // `{state}`, a derived value `{state + 1}`, an effect, a local call, or a
    // host-element attribute — is a use right here.
    const attribute =
      ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
        ? node.parent.parent
        : enclosingHandlerAttribute(node);
    const childComponent =
      attribute && resolveComponentFn(attribute.parent.parent.tagName, checker);
    if (!attribute || !childComponent) {
      if (isValue) current.usage |= Usage.Gets;
      if (isSetter) current.usage |= Usage.Sets;
      return;
    }

    const propName = ts.isIdentifier(attribute.name) ? attribute.name.text : undefined;
    if (propName === undefined) {
      debug("skip: JSX attribute with no resolvable name — %s", nodeLoc(node));
      return;
    }

    recordSymbolRemapToChild(
      childComponent,
      attribute.parent.parent,
      propName,
      isValue,
      isSetter,
      node,
    );
  }

  // walk the component body
  function visit(node: ts.Node) {
    if (ts.isJsxSpreadAttribute(node)) forwardSpread(node);
    if (ts.isIdentifier(node)) recordStateReference(node);
    ts.forEachChild(node, visit);
  }
  if (fn.body) {
    visit(fn.body);
  }
}

// A JSX spread (`{...expr}`) forwards an object's props. Resolve it to the
// object literal it carries when that's statically knowable: an inline
// `{...{ count }}` or an identifier bound to one (`const props = { count }`).
function resolveSpreadObject(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): ts.ObjectLiteralExpression | undefined {
  if (ts.isObjectLiteralExpression(expr)) return expr;
  if (ts.isIdentifier(expr)) {
    const decl = checker.getSymbolAtLocation(expr)?.valueDeclaration;
    if (
      decl &&
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      ts.isObjectLiteralExpression(decl.initializer)
    ) {
      return decl.initializer;
    }
  }
  return undefined;
}

function spreadPropEntry(
  prop: ts.ObjectLiteralElementLike,
  checker: ts.TypeChecker,
): { keyName: string; valueSymbol: ts.Symbol } | undefined {
  if (ts.isShorthandPropertyAssignment(prop)) {
    const valueSymbol = checker.getShorthandAssignmentValueSymbol(prop);
    if (valueSymbol) return { keyName: prop.name.text, valueSymbol };
  }
  return undefined;
}

function resolveComponentFn(
  tagName: ts.JsxTagNameExpression,
  checker: ts.TypeChecker,
): ComponentFn | undefined {
  let sym = checker.getSymbolAtLocation(tagName);
  if (!sym) return undefined;
  if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);

  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl) return undefined;

  if (ts.isFunctionDeclaration(decl) || ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) {
    return decl;
  }
  // const Child = () => {...} / function () {...} / memo(() => {...}) /
  // forwardRef((p, ref) => {...}) / memo(forwardRef(...))
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    return unwrapComponentFn(decl.initializer);
  }
  return undefined;
}

// Peel HOC call wrappers off an initializer to find the underlying component
// function. `memo(() => {...})` and `forwardRef((p, ref) => {...})` both pass
// the render function as an argument, so recurse into call arguments.
function unwrapComponentFn(expr: ts.Expression): ComponentFn | undefined {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    for (const arg of expr.arguments) {
      const found = unwrapComponentFn(arg);
      if (found) return found;
    }
  }
  return undefined;
}

function getEnclosingComponentFunction(node: ts.Node): ComponentFn | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (isComponentFn(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

// A handler prop carries state across a component boundary:
// `<Child onSave={() => setBio(x)} />`. The matched identifier (`setBio`) sits
// inside a function expression that is the *value* of a JSX attribute; climbing
// out of that function lands on the attribute. Returns that attribute, so the
// handler can be forwarded like a renamed getter/setter.
//
// Returns undefined for shapes that must NOT forward: a non-function attribute
// value (`label={count + 1}` — a detached derived value the child never sees as
// state), a render-prop child (`<Wrap>{(x) => ...}</Wrap>` — not an attribute),
// and references that never reach a JSX attribute (effects, local calls).
function enclosingHandlerAttribute(node: ts.Node): ts.JsxAttribute | undefined {
  let cur: ts.Node | undefined = node.parent;
  let crossedFunction: ts.ArrowFunction | ts.FunctionExpression | undefined;

  while (cur) {
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      // outermost function below the JSX expression wins (we climb inside-out)
      crossedFunction = cur;
    } else if (ts.isJsxExpression(cur)) {
      // the function we crossed must itself be the attribute's value
      if (crossedFunction && cur.expression === crossedFunction && ts.isJsxAttribute(cur.parent)) {
        return cur.parent;
      }
      return undefined;
    } else if (ts.isJsxElement(cur) || ts.isJsxFragment(cur) || ts.isSourceFile(cur)) {
      return undefined;
    }
    cur = cur.parent;
  }

  return undefined;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

// The symbol `<App />` consumers resolve to — read off the same identifier
// that names the component, so name and owner symbol always agree.
function getFunctionOwnerSymbol(fn: ComponentFn, checker: ts.TypeChecker): ts.Symbol | undefined {
  const id = maybeComponentNameIdentifier(fn);
  return id ? checker.getSymbolAtLocation(id) : undefined;
}

function matchPropBinding(
  fn: ComponentFn,
  propName: string,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  const param = fn.parameters[0];
  if (!param) return undefined;

  if (ts.isIdentifier(param.name)) {
    return checker.getSymbolAtLocation(param.name);
  }

  if (ts.isObjectBindingPattern(param.name)) {
    for (const el of param.name.elements) {
      // propertyName is set only when renamed: { value: v }
      const key = el.propertyName ?? el.name;

      if (ts.isIdentifier(key) && key.text === propName && ts.isIdentifier(el.name)) {
        return checker.getSymbolAtLocation(el.name); // ← the local binding
      }
    }
  }

  // handle the prop variations

  return undefined;
}

export function retrieveClosestCommonParentFromRoot(root: DrillerRoot): DrillerRoot | DrillerNode {
  if (hasGetOrSet(root.usage)) {
    return root;
  }

  let match;

  // dfs with nodes
  function visit(node: DrillerNode | DrillerRoot) {
    if (node.children.length >= 2) {
      match = node;
      return;
    }
    if (hasGetOrSet(node.usage)) {
      match = node;
      return;
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  visit(root);

  if (match) return match;

  return root;
}
