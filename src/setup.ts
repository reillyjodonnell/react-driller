import ts from "typescript";
import path from "node:path";

export function generateSetup({ filePath }: { filePath: string }): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
  program: ts.Program;
} {
  const absPath = path.resolve(process.cwd(), filePath);
  const options = resolveCompilerOptions(absPath);

  const program = ts.createProgram({
    rootNames: [absPath],
    options,
  });

  const sourceFile = program.getSourceFile(absPath);
  if (!sourceFile) {
    throw new Error(`could not load source file: ${absPath}`);
  }

  return {
    sourceFile,
    checker: program.getTypeChecker(),
    program,
  };
}

function resolveCompilerOptions(absPath: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    path.dirname(absPath),
    ts.sys.fileExists,
    "tsconfig.json",
  );

  if (!configPath) return defaultOptions();

  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error || !config) return defaultOptions();

  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
  );

  return {
    ...parsed.options,
    noResolve: false,
    noEmit: true,
    skipLibCheck: true,
  };
}

function defaultOptions(): ts.CompilerOptions {
  return {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    allowImportingTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    noEmit: true,
  };
}
