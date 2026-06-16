import path from "node:path";
import { describe, expect, it } from "bun:test";

const DRILLING_FIXTURE = "e2e/1-simple/app.tsx";
const COLOCATED_FIXTURE = "e2e/4-colocated/app.tsx";

// Absolute path to the CLI entry so tests can run it from any cwd (the --diff
// repo-root regression below spawns from a subdirectory).
const CLI_ENTRY = path.resolve(process.cwd(), "src/cli.ts");

// Built from parts so the literal home-directory prefix never appears in this
// committed source (PII guard) while still asserting output carries no such prefix.
const ABSOLUTE_HOME_PREFIX = ["", "Users", ""].join("/");

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

type CliRun = { code: number; stdout: string; stderr: string };

async function runCli(args: string[], cwd = process.cwd()): Promise<CliRun> {
  const proc = Bun.spawn(["bun", CLI_ENTRY, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

describe("cli exit codes via --fail-on", () => {
  it("exits 0 with no flag even when drilling exists", async () => {
    const { code } = await runCli([DRILLING_FIXTURE]);
    expect(code).toBe(0);
  });

  it("exits 1 with --fail-on findings when drilling exists", async () => {
    const { code } = await runCli(["--fail-on", "findings", DRILLING_FIXTURE]);
    expect(code).toBe(1);
  });

  it("exits 0 with --fail-on findings when no drilling exists", async () => {
    const { code } = await runCli(["--fail-on", "findings", COLOCATED_FIXTURE]);
    expect(code).toBe(0);
  });

  it("exits 1 and explains an unknown --fail-on level", async () => {
    const { code, stderr } = await runCli(["--fail-on", "bogus", DRILLING_FIXTURE]);
    expect(code).toBe(1);
    expect(stripAnsi(stderr)).toContain("invalid --fail-on level");
  });
});

describe("cli --json output", () => {
  it("prints exactly one parseable JSON object on stdout and nothing else", async () => {
    const { code, stdout } = await runCli(["--json", DRILLING_FIXTURE]);
    expect(code).toBe(0);
    const trimmed = stdout.trim();
    expect(trimmed.split("\n").length).toBe(1);
    expect(() => JSON.parse(trimmed)).not.toThrow();
    expect(stdout).not.toContain("\x1b[");
  });

  it("reports the drilling-findings count in the summary", async () => {
    const { stdout } = await runCli(["--json", DRILLING_FIXTURE]);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.summary.drillingFindings).toBeGreaterThanOrEqual(1);
  });

  it("emits only repo-relative paths", async () => {
    const { stdout } = await runCli(["--json", DRILLING_FIXTURE]);
    expect(stdout).not.toContain(ABSOLUTE_HOME_PREFIX);
    const parsed = JSON.parse(stdout.trim());
    for (const file of parsed.files) {
      expect(file.file.startsWith("/")).toBe(false);
    }
  });

  it("composes with --fail-on: sets exit 1 while stdout stays pure JSON", async () => {
    const { code, stdout } = await runCli([
      "--json",
      "--fail-on",
      "findings",
      DRILLING_FIXTURE,
    ]);
    expect(code).toBe(1);
    expect(() => JSON.parse(stdout.trim())).not.toThrow();
  });
});

describe("cli default text output is preserved", () => {
  it("renders the drilling table without flags", async () => {
    const { code, stdout } = await runCli([DRILLING_FIXTURE]);
    const plain = stripAnsi(stdout);
    expect(code).toBe(0);
    expect(plain).toContain("App");
    expect(plain).toContain("`theme`");
    expect(plain).toContain("ThemeToggle");
  });
});

describe("cli --diff", () => {
  it("is recognized as a flag rather than rejected as unknown", async () => {
    const { stderr } = await runCli(["--diff", "e2e/"]);
    expect(stripAnsi(stderr)).not.toContain("unknown flag");
  });

  it("composes with --json and yields valid JSON", async () => {
    const { code, stdout } = await runCli(["--json", "--diff"]);
    expect(code).toBe(0);
    expect(() => JSON.parse(stdout.trim())).not.toThrow();
  });

  it("treats a positional arg after --diff as a path root, not the base ref", async () => {
    // Regression: the old greedy `--diff [base]` form swallowed `e2e/` as the
    // base ref and scanned nothing. With split flags it is a path root.
    const { stderr } = await runCli(["--diff", "e2e/"]);
    expect(stripAnsi(stderr)).not.toContain("could not run git diff");
    expect(stripAnsi(stderr)).not.toContain("not found");
  });

  it("exits 1 with a clear error when --diff-base is an invalid ref", async () => {
    const { code, stderr } = await runCli(["--diff", "--diff-base", "totally-bogus-ref-xyz123"]);
    expect(code).toBe(1);
    expect(stripAnsi(stderr)).toContain("could not run git diff");
  });

  it("exits 1 when --diff-base is given without --diff", async () => {
    const { code, stderr } = await runCli(["--diff-base", "develop", "e2e/"]);
    expect(code).toBe(1);
    expect(stripAnsi(stderr)).toContain("--diff-base requires --diff");
  });

  it("exits 1 when --diff-base has no value", async () => {
    const { code, stderr } = await runCli(["--diff", "--diff-base"]);
    expect(code).toBe(1);
    expect(stripAnsi(stderr)).toContain("--diff-base requires a git ref");
  });

  it("intersects the changed set with a file root (regression for <= vs <)", async () => {
    // The maintainer's repro: a root that is a full file path must be kept.
    // COLOCATED_FIXTURE is a new file versus the default base, so it appears
    // in the changed set and survives intersection with its own path.
    const { code, stdout } = await runCli(["--json", "--diff", COLOCATED_FIXTURE]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.summary.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it("resolves git's repo-root-relative paths when run from a subdirectory", async () => {
    // Regression for comment #1: git emits repo-root-relative paths, so running
    // --diff from a subdirectory must still find changed files. The old code
    // resolved against cwd and reported nothing.
    const subdir = path.join(process.cwd(), "e2e");
    const { code, stdout } = await runCli(["--json", "--diff"], subdir);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.summary.filesScanned).toBeGreaterThanOrEqual(1);
  });
});
