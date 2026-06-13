#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFiles, type AnalysisResult } from "./analysis";
import { filterChangedFiles } from "./diffFilter";
import { startEngine } from "./engine";
import {
  FAIL_ON_LEVELS,
  exitCodeFor,
  validateFailOnLevel,
  type FailOnLevel,
} from "./failOn";
import { renderJson } from "./jsonRenderer";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git",
  "coverage",
  ".turbo",
  ".cache",
]);

const DEFAULT_DIFF_BASE = "main";

const EMPTY_RESULT: AnalysisResult = {
  files: [],
  summary: { filesScanned: 0, statesFound: 0, drillingFindings: 0 },
};

function readVersion(): string {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp() {
  console.log();
  console.log(`  ${bold("react-driller")}  ${dim("· spot prop drilling")}`);
  console.log();
  console.log(`  ${bold("usage")}  react-driller <path>...`);
  console.log(`         ${dim("each path may be a file or a directory")}`);
  console.log(`         ${dim("directories are walked for .tsx and .jsx files")}`);
  console.log();
  console.log(`  ${bold("flags")}`);
  console.log(`    -h, --help          show this help`);
  console.log(`    -v, --version       print version`);
  console.log(`    --json              emit one JSON object on stdout, nothing else`);
  console.log(`    --fail-on <level>   exit code policy: ${FAIL_ON_LEVELS.join(" | ")} (default none)`);
  console.log(`    --diff [base]       scan only files changed vs base (default ${DEFAULT_DIFF_BASE})`);
  console.log();
  console.log(`  ${bold("examples")}`);
  console.log(`    ${dim("react-driller src/")}`);
  console.log(`    ${dim("react-driller src/app.tsx src/components/")}`);
  console.log(`    ${dim("react-driller --json src/ > report.json")}`);
  console.log(`    ${dim("react-driller --fail-on findings src/")}`);
  console.log(`    ${dim("react-driller --diff develop")}`);
  console.log();
}

function collectFromDir(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collectFromDir(full, out);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function collectFiles(rawPaths: string[]): string[] {
  const files: string[] = [];
  for (const raw of rawPaths) {
    const abs = path.resolve(process.cwd(), raw);
    if (!fs.existsSync(abs)) {
      console.error(`${red("error")} not found: ${dim(abs)}`);
      process.exit(1);
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      collectFromDir(abs, files);
    } else {
      files.push(abs);
    }
  }
  return [...new Set(files)];
}

function gitChangedFiles(base: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=d", base],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    console.error(`${red("error")} could not run git diff against base ${dim(base)}`);
    console.error(`${dim("ensure this is a git repository and the base ref exists")}`);
    process.exit(1);
  }
}

function collectChangedFiles(base: string, roots: string[]): string[] {
  const changed = gitChangedFiles(base);
  const relevant = filterChangedFiles(changed, roots);
  const absolute = relevant
    .map((rel) => path.resolve(process.cwd(), rel))
    .filter((abs) => fs.existsSync(abs));
  return [...new Set(absolute)];
}

type ParsedArgs = {
  json: boolean;
  failOn: FailOnLevel;
  diff: boolean;
  diffBase: string;
  paths: string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  let json = false;
  let failOn: FailOnLevel = "none";
  let diff = false;
  let diffBase = DEFAULT_DIFF_BASE;
  const paths: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--json") {
      json = true;
    } else if (arg === "--fail-on") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        console.error(`${red("error")} --fail-on requires a level: ${FAIL_ON_LEVELS.join(", ")}`);
        process.exit(1);
      }
      const validation = validateFailOnLevel(value);
      if (!validation.ok) {
        console.error(`${red("error")} invalid --fail-on level: ${dim(validation.raw)}`);
        console.error(`${dim(`valid levels: ${validation.validLevels.join(", ")}`)}`);
        process.exit(1);
      }
      failOn = validation.level;
      i += 1;
    } else if (arg === "--diff") {
      diff = true;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        diffBase = next;
        i += 1;
      }
    } else if (arg.startsWith("-")) {
      console.error(`${red("error")} unknown flag: ${dim(arg)}`);
      console.error(`${dim("run `react-driller --help` for usage")}`);
      process.exit(1);
    } else {
      paths.push(arg);
    }
  }

  return { json, failOn, diff, diffBase, paths };
}

const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  printHelp();
  process.exit(argv.length === 0 ? 1 : 0);
}

if (argv.includes("-v") || argv.includes("--version")) {
  console.log(readVersion());
  process.exit(0);
}

const { json, failOn, diff, diffBase, paths } = parseArgs(argv);

let files: string[];
if (diff) {
  files = collectChangedFiles(diffBase, paths);
} else {
  if (paths.length === 0) {
    printHelp();
    process.exit(1);
  }
  files = collectFiles(paths);
}

let result: AnalysisResult;
if (files.length === 0) {
  result = EMPTY_RESULT;
  if (json) {
    process.stdout.write(`${renderJson(result)}\n`);
  } else {
    console.log(`  ${dim("no .tsx or .jsx files found")}`);
  }
} else if (json) {
  result = analyzeFiles(files);
  process.stdout.write(`${renderJson(result)}\n`);
} else {
  result = startEngine(files);
}

process.exitCode = exitCodeFor(result, failOn);
