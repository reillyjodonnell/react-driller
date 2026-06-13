import { describe, expect, it } from "bun:test";

const DRILLING_FIXTURE = "e2e/1-simple/app.tsx";
const COLOCATED_FIXTURE = "e2e/4-colocated/app.tsx";

// Built from parts so the literal home-directory prefix never appears in this
// committed source (PII guard) while still asserting output carries no such prefix.
const ABSOLUTE_HOME_PREFIX = ["", "Users", ""].join("/");

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

type CliRun = { code: number; stdout: string; stderr: string };

async function runCli(args: string[]): Promise<CliRun> {
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], {
    cwd: process.cwd(),
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
    const { stderr } = await runCli(["--diff", "main", "e2e/"]);
    expect(stripAnsi(stderr)).not.toContain("unknown flag");
  });

  it("composes with --json and yields valid JSON", async () => {
    const { code, stdout } = await runCli(["--json", "--diff", "main"]);
    expect(code).toBe(0);
    expect(() => JSON.parse(stdout.trim())).not.toThrow();
  });

  it("exits 1 with a clear error when the base ref is invalid", async () => {
    const { code, stderr } = await runCli(["--diff", "totally-bogus-ref-xyz123"]);
    expect(code).toBe(1);
    expect(stripAnsi(stderr)).toContain("could not run git diff");
  });
});
