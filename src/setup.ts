import ts from "typescript";

import fs from "node:fs";
import path from "node:path";

export function generateSetup({ filePath }: { filePath: string }): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
  program: ts.Program;
} {
  const fileName = path.resolve(process.cwd(), filePath);

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

  return { checker, program, sourceFile };
}
