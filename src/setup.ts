import ts from "typescript";
import path from "node:path";

export function generateSetup({ filePaths }: { filePaths: string[] }): {
  sourceFiles: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker;
  program: ts.Program;
} {
  if (filePaths.length === 0) {
    throw new Error("generateSetup requires at least one file");
  }

  const absPaths = filePaths.map((p) => path.resolve(process.cwd(), p));
  const options = resolveCompilerOptions(absPaths[0]!);

  const program = ts.createProgram({
    rootNames: absPaths,
    options,
  });

  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const absPath of absPaths) {
    const sourceFile = program.getSourceFile(absPath);
    if (!sourceFile) {
      throw new Error(`could not load source file: ${absPath}`);
    }
    sourceFiles.set(absPath, sourceFile);
  }

  return {
    sourceFiles,
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
