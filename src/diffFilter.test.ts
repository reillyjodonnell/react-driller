import { describe, it, expect } from "bun:test";
import { filterChangedFiles } from "./diffFilter";

describe("filterChangedFiles", () => {
  it("keeps .tsx and .jsx source files", () => {
    const result = filterChangedFiles(["src/App.tsx", "src/Foo.jsx"], []);
    expect(result).toEqual(["src/App.tsx", "src/Foo.jsx"]);
  });

  it("drops non-source extensions", () => {
    const result = filterChangedFiles(["src/Foo.ts", "README.md"], []);
    expect(result).toEqual([]);
  });

  it("drops paths inside ignored directories", () => {
    const result = filterChangedFiles(
      ["node_modules/x/Comp.tsx", "dist/Comp.tsx", "coverage/Comp.tsx"],
      [],
    );
    expect(result).toEqual([]);
  });

  it("drops ignored directories at any depth", () => {
    const result = filterChangedFiles(
      ["packages/app/dist/Comp.tsx", "packages/app/.cache/Comp.jsx"],
      [],
    );
    expect(result).toEqual([]);
  });

  it("with roots ['src'] keeps files under the root and drops others", () => {
    const result = filterChangedFiles(["src/App.tsx", "other/App.tsx"], ["src"]);
    expect(result).toEqual(["src/App.tsx"]);
  });

  it("does not match a root by accidental string prefix", () => {
    const result = filterChangedFiles(["srcfoo/App.tsx"], ["src"]);
    expect(result).toEqual([]);
  });

  it("with empty roots keeps any non-ignored .tsx/.jsx regardless of directory", () => {
    const result = filterChangedFiles(
      ["anywhere/deep/Comp.tsx", "top.jsx"],
      [],
    );
    expect(result).toEqual(["anywhere/deep/Comp.tsx", "top.jsx"]);
  });

  it("intersects multiple roots", () => {
    const result = filterChangedFiles(
      ["src/App.tsx", "packages/ui/Button.jsx", "other/Skip.tsx"],
      ["src", "packages/ui"],
    );
    expect(result).toEqual(["src/App.tsx", "packages/ui/Button.jsx"]);
  });

  it("is pure and deterministic over its inputs", () => {
    const changed = ["src/App.tsx", "src/Foo.ts", "node_modules/x/Comp.tsx"];
    const roots = ["src"];
    const first = filterChangedFiles(changed, roots);
    const second = filterChangedFiles(changed, roots);
    expect(first).toEqual(second);
    expect(changed).toEqual([
      "src/App.tsx",
      "src/Foo.ts",
      "node_modules/x/Comp.tsx",
    ]);
  });
});
