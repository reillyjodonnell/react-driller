import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { startEngine } from "./engine";

function captureStartEngine(filePaths: string[]): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    startEngine(filePaths);
  } finally {
    console.log = original;
  }
  return lines;
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Built from parts so this guard test never embeds the literal home-dir prefix.
const homeDirPrefix = `/${"Users"}/`;

describe("startEngine text rendering", () => {
  let lines: string[];

  beforeEach(() => {
    lines = captureStartEngine(["e2e/1-simple/app.tsx"]);
  });

  afterEach(() => {
    lines = [];
  });

  it("logs the App component header", () => {
    const plain = lines.map(stripAnsi);
    expect(plain.some((line) => line.includes("App"))).toBe(true);
  });

  it("logs a co-located check line for count", () => {
    const plain = lines.map(stripAnsi);
    expect(
      plain.some((line) => line.includes("`count`") && line.includes("✓ in")),
    ).toBe(true);
  });

  it("logs a drilling line for theme pointing at ThemeToggle", () => {
    const plain = lines.map(stripAnsi);
    expect(
      plain.some(
        (line) => line.includes("`theme`") && line.includes("ThemeToggle"),
      ),
    ).toBe(true);
  });

  it("emits no absolute paths in any logged line", () => {
    for (const line of lines) {
      const plain = stripAnsi(line);
      expect(plain.includes(homeDirPrefix)).toBe(false);
      for (const token of plain.split(/\s+/)) {
        expect(token.startsWith("/")).toBe(false);
      }
    }
  });
});
