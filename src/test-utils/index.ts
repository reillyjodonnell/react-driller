import ts from "typescript";

export function createFixture({
  fileName,
  source,
}: {
  fileName: string;
  source: string;
}): {
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
