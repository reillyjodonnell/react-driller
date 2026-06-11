import ts from "typescript";
import {
  createDrillerNode,
  hasGetOrSet,
  Usage,
  type DrillerNode,
  type DrillerRoot,
} from "./node";

/// analyzer produces a driller tree
export function useStateExtractor(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): DrillerRoot[] {
  const roots: DrillerRoot[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useState"
    ) {
      if (
        ts.isVariableDeclaration(node.parent) &&
        ts.isArrayBindingPattern(node.parent.name)
      ) {
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

          if (!componentOwner)
            throw new Error(
              "no op - components should always be found in a useState. Harden logic around component detection for useState call",
            );

          const ownerSymbol = getFunctionOwnerSymbol(componentOwner, checker);

          if (ownerSymbol && valueSymbol) {
            const sourceFile = node.getSourceFile();
            const pos = node.getStart(sourceFile);
            const { line, character } =
              sourceFile.getLineAndCharacterOfPosition(pos);

            roots.push({
              children: [],
              name: ownerSymbol.getName(),
              parent: null,
              setter: maybeSetterSymbol
                ? new Set([maybeSetterSymbol])
                : new Set(),
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

type ComponentFn =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

function isComponentFn(n: ts.Node): n is ComponentFn {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n)
  );
}

export function scanNode(
  current: DrillerRoot | DrillerNode,
  checker: ts.TypeChecker,
  queue: Array<DrillerRoot | DrillerNode>,
) {
  const fn = current.ownerComponentFunction;
  // go to node's function body
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);

      if (symbol) {
        const getterMatch = current.getter.has(symbol);
        const setterMatch = current.setter.has(symbol);

        // pass over the getter and setter from the useState declaration
        const isDeclarationName =
          ts.isBindingElement(node.parent) && node.parent.name === node;

        if (!isDeclarationName) {
          if (ts.isJsxExpression(node.parent)) {
            // the grandparent should be a jsx attribute (need to confirm if it's 100% of time)
            const maybeNodeAttachedToJsxElement =
              nodeAttachedToJsxElement(node);
            if (maybeNodeAttachedToJsxElement) {
              // find what component this is that's being passed
              const jsxAttribute = getEnclosingJsxAttribute(node);
              const opening = jsxAttribute?.parent.parent;
              if (!opening) throw new Error("no op - check opening logic");
              const propName = jsxAttribute
                ? ts.isIdentifier(jsxAttribute.name)
                  ? jsxAttribute.name.text
                  : undefined
                : undefined;

              const childFn = resolveComponentFn(opening.tagName, checker); // jump

              if (!childFn) {
                /* host element → treat as use */
              } else if (!getterMatch && !setterMatch) {
                /* identifier sits on a JSX attribute but isn't this state's
                   getter/setter — nothing to forward, skip without creating a child */
              } else {
                const newSymbol =
                  childFn && matchPropBinding(childFn, propName ?? "", checker);

                if (!newSymbol)
                  throw new Error(
                    "no op - symbol didn't match on the flip from parent to child. Fix logic",
                  );

                const name = childFn.name?.text ?? newSymbol?.getName();

                if (!name)
                  throw new Error(
                    "No op - the logic for name is wrong - a node should always have a name (the component function name)",
                  );

                // we treat getter and setter separately, so this logic will run twice for
                // something like <MainPanel count={count} setCount={setCount} />
                // so we will need to make sure it doesn't already have an entry
                const existing = current.children.find(
                  (child) => child.jsxElement === opening,
                );

                let childSource;
                if (!existing) {
                  const childSourceFile = childFn.getSourceFile();
                  const childPos = childFn.getStart(childSourceFile);
                  const { line: cl, character: cc } =
                    childSourceFile.getLineAndCharacterOfPosition(childPos);
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
                  child.getter.add(newSymbol!);
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
            } else {
              if (getterMatch) {
                current.usage |= Usage.Gets;
              }
              if (setterMatch) {
                current.usage |= Usage.Sets;
              }
            }
          } else {
            if (getterMatch) {
              current.usage |= Usage.Gets;
            }
            if (setterMatch) {
              current.usage |= Usage.Sets;
            }
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

function resolveComponentFn(
  tagName: ts.JsxTagNameExpression,
  checker: ts.TypeChecker,
): ComponentFn | undefined {
  let sym = checker.getSymbolAtLocation(tagName);
  if (!sym) return undefined;
  if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);

  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl) return undefined;

  if (
    ts.isFunctionDeclaration(decl) ||
    ts.isArrowFunction(decl) ||
    ts.isFunctionExpression(decl)
  ) {
    return decl;
  }
  // const Child = () => {...}  or  const Child = function () {...}
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = decl.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  }
  return undefined;
}

export function collectComponents(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
) {
  // 1. roughly track the symbols tied to useState (whether destructured or not)
  // 2. follow them wherever they lead marking the component e.g. on a read, on a set, depending on symbol matched
  // 3. When detect jsx tag has tracked symbol (indicates component) create node, mark as child of current node, and add symbol to getter or setter (depending on match)
  // repeat 2-3
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
      ts.isSourceFile(current)
    )
      return undefined;
    current = current.parent;
  }

  return undefined;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function getFunctionOwnerSymbol(
  fn: ts.SignatureDeclaration,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (ts.isFunctionDeclaration(fn) && fn.name) {
    return checker.getSymbolAtLocation(fn.name);
  }

  return undefined;
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

      if (
        ts.isIdentifier(key) &&
        key.text === propName &&
        ts.isIdentifier(el.name)
      ) {
        return checker.getSymbolAtLocation(el.name); // ← the local binding
      }
    }
  }

  // handle the prop variations

  return undefined;
}

export function retrieveLeastCommonAncestorFromRoot(
  root: DrillerRoot,
): DrillerRoot | DrillerNode {
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
