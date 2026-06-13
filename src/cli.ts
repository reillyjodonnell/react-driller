#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startEngine } from "./engine";

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
  console.log(`    -h, --help     show this help`);
  console.log(`    -v, --version  print version`);
  console.log();
  console.log(`  ${bold("examples")}`);
  console.log(`    ${dim("react-driller src/")}`);
  console.log(`    ${dim("react-driller src/app.tsx src/components/")}`);
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

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

if (args.includes("-v") || args.includes("--version")) {
  console.log(readVersion());
  process.exit(0);
}

const unknownFlag = args.find((a) => a.startsWith("-"));
if (unknownFlag) {
  console.error(`${red("error")} unknown flag: ${dim(unknownFlag)}`);
  console.error(`${dim("run `react-driller --help` for usage")}`);
  process.exit(1);
}

const files = collectFiles(args);

if (files.length === 0) {
  console.log(`  ${dim("no .tsx or .jsx files found")}`);
  process.exit(0);
}

startEngine(files);
