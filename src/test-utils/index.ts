import ts from "typescript";
import {
  collectSharedComponents,
  retrieveLiftTarget,
  scanNode,
  useStateExtractor,
} from "../analyzer";
import type { DrillerNode, DrillerRoot } from "../node";

// Shared analyzer fixtures. `extractRoots` runs only the extraction pass
// (which useState calls become roots); `analyzeRoots` additionally walks each
// root through scanNode so usage flags and children are populated (the
// closest-common-parent query then reads off that tree);
// `analyzeRoot` returns the single expected root and throws if none was found.
export function extractRoots(source: string): DrillerRoot[] {
  const { sourceFile, checker } = createFixture({ fileName: "app.tsx", source });
  return useStateExtractor(sourceFile, checker);
}

export function analyzeRoots(source: string): DrillerRoot[] {
  const { sourceFile, checker } = createFixture({ fileName: "app.tsx", source });
  const roots = useStateExtractor(sourceFile, checker);
  for (const root of roots) {
    const queue: Array<DrillerRoot | DrillerNode> = [root];
    while (queue.length) {
      const node = queue.shift();
      if (node) scanNode(node, checker, queue);
    }
  }
  return roots;
}

export function analyzeRoot(source: string): DrillerRoot {
  const [root] = analyzeRoots(source);
  if (!root) throw new Error("expected a root for this fixture");
  return root;
}

// Resolve the shared-aware lift target for the single root in `source`: who the
// state should move to (`target`) and whether that's a move at all (`drilled`),
// after excluding components rendered in more than one place. Mirrors what
// analyzeFiles does, for unit-testing the shared-component rule.
export function liftResult(source: string): {
  owner: string;
  target: string;
  drilled: boolean;
} {
  const { sourceFile, checker } = createFixture({ fileName: "app.tsx", source });
  const roots = useStateExtractor(sourceFile, checker);
  const [root] = roots;
  if (!root) throw new Error("expected a root for this fixture");
  for (const r of roots) {
    const queue: Array<DrillerRoot | DrillerNode> = [r];
    while (queue.length) {
      const node = queue.shift();
      if (node) scanNode(node, checker, queue);
    }
  }
  const shared = collectSharedComponents([sourceFile], checker);
  const target = retrieveLiftTarget(root, shared, checker);
  return { owner: root.name, target: target.name, drilled: target !== root };
}

export function createFixture({ fileName, source }: { fileName: string; source: string }): {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
} {
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

  return {
    program,
    checker,
    sourceFile,
  };
}
