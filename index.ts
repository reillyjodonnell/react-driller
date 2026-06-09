import ts from "typescript";

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

const fileName = path.join(cwd, "fixtures/app.tsx");

const source = fs.readFileSync(fileName, "utf8");

const sourceFile = ts.createSourceFile(
  fileName,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const host = ts.createCompilerHost({
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
});

host.getSourceFile = (name) => {
  if (name === fileName) return sourceFile;
  return undefined;
};

host.readFile = (name) => {
  if (name === fileName) return source;
  return undefined;
};

host.fileExists = (name) => name === fileName;

const program = ts.createProgram(
  [fileName],
  {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    noResolve: true,
  },
  host,
);

const checker = program.getTypeChecker();

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/*
detect if we hit tracked symbol
flip appropiate flags
when we hit useState start capture with current component as creator
track if getter or setter is consumed or merely passed as props
track identity switch from lexical scope change on component invocation e.g. <Whatever prop={prop} ... using symbol
create edges to newly invoked component.

REPEAT

*/

function visit(
  node: ts.Node,
  currentComponentNode: ts.FunctionDeclaration | null,
) {
  let next = currentComponentNode;

  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    isPascalCase(node.name.getText())
  ) {
    next = node;
    console.log("I FOUND A COMPONENT", node.name.getText());
    const sourceFile = node.getSourceFile();
    const pos = node.getStart(sourceFile);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    if (roots.length) {
      const drillerNode: DrillerNode = {
        children: [],
        getter: null,
        name: node.name.getText(),
        parent: roots[0],
        setter: null,
        source: {
          column: character + 1,
          file: sourceFile.fileName,
          line: line + 1,
        },
        type: "node",
      };
      for (const root of roots) {
        root.children.push(drillerNode);
      }
    }
  }

  // handle seeing component invocations (e.g. <Component... /> - can be self closing or not)
  // this establishes the link - e.g. symbol changes - that will occur once we hit that function in teh file (or later file)
  if (ts.isJsxSelfClosingElement(node)) {
    const tag = node.tagName;
    const symbol = checker.getSymbolAtLocation(tag);

    console.log("JSX tag text:", tag.getText());
    console.log("symbol name:", symbol?.getName());

    const decl = symbol?.getDeclarations()?.[0];
    console.log("resolved declaration:", decl?.getText());
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useState"
  ) {
    if (!currentComponentNode) {
      throw new Error("useState outside tracked component");
    }

    if (!currentComponentNode.name) {
      throw new Error("component has no name");
    }

    const ownerSymbol = checker.getSymbolAtLocation(currentComponentNode.name);

    if (!ownerSymbol) {
      throw new Error("component name has no symbol");
    }

    console.log(
      "I am useState and my parent is:",
      currentComponentNode.name.getText(),
    );

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

        if (ownerSymbol && valueSymbol) {
          trackedNode.getter = valueSymbol;
          trackedNode.setter = maybeSetterSymbol ?? null;

          const sourceFile = node.getSourceFile();
          const pos = node.getStart(sourceFile);
          const { line, character } =
            sourceFile.getLineAndCharacterOfPosition(pos);

          const root: DrillerRoot = {
            children: [],
            name: currentComponentNode.name.getText(),
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
          };

          roots.push(root);
        }
      }
    }

    tracked.push(trackedNode);
  }

  ts.forEachChild(node, (child) => visit(child, next));
}

visit(sourceFile, null);

for (const root of roots) {
  // traverse roots and show all children
  console.log("root name: ", root.name);
  console.log(
    `At: ${root.source.file}:${root.source.line}:${root.source.column}`,
  );

  for (const child of root.children) {
    console.log("child: ", child.name);
  }
}
