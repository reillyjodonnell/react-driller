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
    const opening = spread.parent.parent;
    const childFn = resolveComponentFn(opening.tagName, checker);
    for (const prop of object.properties) {
      const entry = spreadPropEntry(prop, checker);
      if (!entry) continue;
      const getterMatch = current.getter.has(entry.valueSymbol);
      const setterMatch = current.setter.has(entry.valueSymbol);
      if (!getterMatch && !setterMatch) continue;
      if (!childFn) {
        // spread onto a host element → the state is used here
        if (getterMatch) current.usage |= Usage.Gets;
        if (setterMatch) current.usage |= Usage.Sets;
        continue;
      }
      forwardToChild(
        current,
        childFn,
        opening,
        entry.keyName,
        getterMatch,
        setterMatch,
        checker,
        queue,
        spread,
      );
    }
  }

  // go to node's function body
  function visit(node: ts.Node) {
    if (ts.isJsxSpreadAttribute(node)) {
      forwardSpread(node);
    }

    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);

      if (symbol) {
        const getterMatch = current.getter.has(symbol);
        const setterMatch = current.setter.has(symbol);

        // pass over the getter and setter from the state-hook declaration
        const isDeclarationName = ts.isBindingElement(node.parent) && node.parent.name === node;

        if (!isDeclarationName) {
          if (ts.isJsxExpression(node.parent) && nodeAttachedToJsxElement(node)) {
            // <Child prop={count} />
            const jsxAttribute = getEnclosingJsxAttribute(node);
            if (!jsxAttribute) {
              if (getterMatch) current.usage |= Usage.Gets;
              if (setterMatch) current.usage |= Usage.Sets;
              return; // exit this visit() call; nothing to drill
            }

            const opening = jsxAttribute.parent.parent;
            const propName = ts.isIdentifier(jsxAttribute.name)
              ? jsxAttribute.name.text
              : undefined;
            const childFn = resolveComponentFn(opening.tagName, checker);

            if (!childFn) {
              // Host element (lowercase tag, or a tag that doesn't resolve to a
              // component function). The state sits directly on a DOM attribute —
              // `<input value={count}/>` reads it, `<button onClick={setCount}>`
              // writes it — so it's consumed here, not forwarded. Record the use.
              if (getterMatch) current.usage |= Usage.Gets;
              if (setterMatch) current.usage |= Usage.Sets;
            } else if (!getterMatch && !setterMatch) {
              /* identifier sits on a JSX attribute but isn't this state's
                 getter/setter — nothing to forward, skip without creating a child */
            } else if (propName === undefined) {
              debug("skip: JSX attribute with no resolvable name — %s", nodeLoc(node));
            } else {
              forwardToChild(
                current,
                childFn,
                opening,
                propName,
                getterMatch,
                setterMatch,
                checker,
                queue,
                node,
              );
            }
          } else {
            if (getterMatch) current.usage |= Usage.Gets;
            if (setterMatch) current.usage |= Usage.Sets;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  if (fn.body) {
    visit(fn.body);
  }
}

function forwardToChild(
  current: DrillerRoot | DrillerNode,
  childFn: ComponentFn,
  opening: ts.JsxOpeningLikeElement,
  propName: string,
  getterMatch: boolean,
  setterMatch: boolean,
  checker: ts.TypeChecker,
  queue: Array<DrillerRoot | DrillerNode>,
  node: ts.Node,
): void {
  const newSymbol = matchPropBinding(childFn, propName, checker);
  if (!newSymbol) {
    debug("skip: prop %s didn't resolve to a child binding — %s", propName, nodeLoc(node));
    return;
  }

  // Name the child by the JSX tag the consumer wrote. childFn.name only exists
  // for declarations / named function expressions; for `const C = () => {}` or
  // `const C = memo(() => {})` it is undefined, so falling back to the tag
  // (rather than the matched prop's symbol) keeps the component's real name.
  const tag = opening.tagName;
  const name = childFn.name?.text ?? (ts.isIdentifier(tag) ? tag.text : tag.getText());
  if (!name) {
    debug("skip: child component has no resolvable name — %s", nodeLoc(node));
    return;
  }

  // getter and setter are forwarded separately, so this can run twice for the
  // same element (e.g. <Panel count={count} setCount={setCount} />) — dedupe by
  // the JSX element so it stays one child node.
  const existing = current.children.find((child) => child.jsxElement === opening);

  let childSource;
  if (!existing) {
    const childSourceFile = childFn.getSourceFile();
    const childPos = childFn.getStart(childSourceFile);
    const { line: cl, character: cc } = childSourceFile.getLineAndCharacterOfPosition(childPos);
    childSource = {
      column: cc + 1,
      file: childSourceFile.fileName,
      line: cl + 1,
    };
  }

  const child: DrillerNode = existing
    ? existing
    : createDrillerNode({
        name,
        parent: current,
        ownerComponentFunction: childFn,
        jsxElement: opening,
        source: childSource!,
      });

  if (getterMatch) {
    child.getter.add(newSymbol);
    current.usage |= Usage.ForwardsGetter;
  }
  if (setterMatch) {
    child.setter.add(newSymbol);
    current.usage |= Usage.ForwardsSetter;
  }

  if (!existing) {
    current.children.push(child);
    queue.push(child);
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

function getEnclosingJsxAttribute(node: ts.Node): ts.JsxAttribute | undefined {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isJsxAttribute(current)) return current;
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      // did we walk all the way up
      ts.isSourceFile(current)
    ) {
      return undefined;
    }
    current = current.parent;
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

function nodeAttachedToJsxElement(node: ts.Node) {
  let current = node;

  while (current) {
    if (ts.isJsxSelfClosingElement(current)) {
      return current;
    }

    if (ts.isJsxOpeningElement(current)) {
      return current;
    }

    current = current.parent;
  }

  return false;
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
