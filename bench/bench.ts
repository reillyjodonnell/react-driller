/**
 * Perf harness for react-driller against real-world React repos.
 *
 * Clones a pinned set of OSS repos (shallow) into bench/repos/, runs the built
 * CLI over each one's source dir under `/usr/bin/time -l`, and reports wall time,
 * peak RSS, and what was found. Pins commits so runs are comparable over time.
 *
 *   bun run build                 # bench measures dist/cli.js, so build first
 *   bun bench/bench.ts            # all repos
 *   bun bench/bench.ts excalidraw # a subset, by key
 *
 * Repos live in a gitignored dir; only this script + the manifest are committed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPOS_DIR = path.join(HERE, "repos");
const CLI = path.join(HERE, "..", "dist", "cli.js");
const RUNS = 3; // median of N timed runs

type Repo = {
  key: string;
  url: string;
  ref: string; // pinned commit SHA
  scan: string[]; // dirs (repo-relative) to point the CLI at
};

// Pinned commits keep numbers comparable. Bump deliberately when refreshing.
const REPOS: Repo[] = [
  {
    key: "excalidraw",
    url: "https://github.com/excalidraw/excalidraw",
    ref: "a2ec2889babf7d2295469c6d90ebe77fae57df84",
    scan: ["packages"],
  },
];

function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ensureRepo(repo: Repo): string {
  const dir = path.join(REPOS_DIR, repo.key);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    console.log(`cloning ${repo.key} …`);
    sh("git", ["init", "-q", dir]);
    sh("git", ["-C", dir, "remote", "add", "origin", repo.url]);
    sh("git", ["-C", dir, "fetch", "-q", "--depth", "1", "origin", repo.ref]);
    sh("git", ["-C", dir, "checkout", "-q", "FETCH_HEAD"]);
  }
  return dir;
}

type Sample = { wallMs: number; rssMb: number };

// `/usr/bin/time -l` on macOS prints "maximum resident set size" in bytes to
// stderr; Linux GNU time uses "-v" with KB. Detect by platform.
function timedRun(dir: string, scan: string[]): { sample: Sample; json: string } {
  const isMac = process.platform === "darwin";
  const timeArgs = isMac
    ? ["-l", "node", CLI, ...scan, "--json"]
    : ["-v", "node", CLI, ...scan, "--json"];
  const start = performance.now();
  const res = spawnSync("/usr/bin/time", timeArgs, { cwd: dir, encoding: "utf8" });
  const wallMs = performance.now() - start;
  const err = res.stderr ?? "";
  let rssMb = NaN;
  if (isMac) {
    const m = err.match(/(\d+)\s+maximum resident set size/);
    if (m) rssMb = Number(m[1]) / 1024 / 1024;
  } else {
    const m = err.match(/Maximum resident set size \(kbytes\):\s+(\d+)/);
    if (m) rssMb = Number(m[1]) / 1024;
  }
  return { sample: { wallMs, rssMb }, json: res.stdout ?? "" };
}

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function main() {
  if (!fs.existsSync(CLI)) {
    console.error(`missing ${CLI} — run \`bun run build\` first`);
    process.exit(1);
  }
  const wanted = process.argv.slice(2);
  const repos = wanted.length ? REPOS.filter((r) => wanted.includes(r.key)) : REPOS;

  const rows: string[][] = [];
  for (const repo of repos) {
    const dir = ensureRepo(repo);
    const samples: Sample[] = [];
    let lastJson = "";
    for (let i = 0; i < RUNS; i++) {
      const { sample, json } = timedRun(dir, repo.scan);
      samples.push(sample);
      lastJson = json;
    }
    const summary = JSON.parse(lastJson).summary as {
      filesScanned: number;
      statesFound: number;
      drillingFindings: number;
    };
    rows.push([
      repo.key,
      String(summary.filesScanned),
      String(summary.statesFound),
      String(summary.drillingFindings),
      `${(median(samples.map((s) => s.wallMs)) / 1000).toFixed(2)}s`,
      `${median(samples.map((s) => s.rssMb)).toFixed(0)}MB`,
    ]);
  }

  const header = ["repo", "files", "states", "drilled", "wall (median)", "peak RSS"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log();
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(fmt(r));
  console.log();
}

main();
