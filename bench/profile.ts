/**
 * Phase profiler: splits a run into program-creation vs analysis, and A/B-tests
 * compiler options to see how much of the cost is the TS type graph (lib.d.ts +
 * @types) that we load but never actually read (we resolve symbols, never types).
 *
 *   bun bench/profile.ts bench/repos/excalidraw/packages
 */
import { performance } from "node:perf_hooks";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
import { retrieveClosestCommonParentFromRoot, scanNode, useStateExtractor } from "../src/analyzer";
import type { DrillerNode, DrillerRoot } from "../src/node";

const SRC_EXT = new Set([".tsx", ".jsx"]);
const IGNORE = new Set(["node_modules", "dist", "build", ".next", ".git", "coverage"]);

function collect(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORE.has(e.name)) collect(full, out);
    } else if (SRC_EXT.has(path.extname(e.name))) out.push(full);
  }
}

function repoOptions(absPath: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(path.dirname(absPath), ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return {};
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return { ...parsed.options, noResolve: false, noEmit: true, skipLibCheck: true };
}

function lean(base: ts.CompilerOptions): ts.CompilerOptions {
  // Keep module resolution (we need to follow imports to our own files) but drop
  // the standard lib and ambient @types — symbol/alias resolution of user code
  // never needs them.
  return { ...base, noLib: true, types: [], typeRoots: [] };
}

function run(label: string, files: string[], options: ts.CompilerOptions, rss0: number) {
  const t0 = performance.now();
  const program = ts.createProgram({ rootNames: files, options });
  const checker = program.getTypeChecker();
  const tProgram = performance.now() - t0;

  const t1 = performance.now();
  let states = 0;
  let drilled = 0;
  for (const abs of files) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    const roots = useStateExtractor(sf, checker);
    for (const root of roots) {
      const queue: Array<DrillerRoot | DrillerNode> = [root];
      while (queue.length) {
        const n = queue.shift();
        if (n) scanNode(n, checker, queue);
      }
    }
    for (const root of roots) {
      states++;
      if (retrieveClosestCommonParentFromRoot(root) !== root) drilled++;
    }
  }
  const tAnalyze = performance.now() - t1;
  const rss = process.memoryUsage().rss / 1024 / 1024 - rss0;

  console.log(
    `${label.padEnd(18)} program ${tProgram.toFixed(0).padStart(6)}ms  analyze ${tAnalyze
      .toFixed(0)
      .padStart(6)}ms  total ${(tProgram + tAnalyze).toFixed(0).padStart(6)}ms  Δrss ${rss.toFixed(
      0,
    )}MB  (${states} states, ${drilled} drilled)`,
  );
}

const dir = path.resolve(process.argv[2] ?? ".");
const files: string[] = [];
collect(dir, files);
console.log(`profiling ${files.length} files under ${dir}\n`);

const base = repoOptions(files[0]!);
const rss0 = process.memoryUsage().rss / 1024 / 1024;
run("current (tsconfig)", files, base, rss0);
run("lean (noLib,types[])", files, lean(base), rss0);
