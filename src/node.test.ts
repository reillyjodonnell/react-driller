import { describe, it, expect } from "bun:test";
import { Usage, type DrillerNode, type DrillerRoot } from "./node";
import ts from "typescript";

describe("state flow tree", () => {
  it("represents a basic prop-drilling path", () => {
    /*
      App
      └─ Panel [forwards]
          └─ Counter [gets | sets]
    */

    const countSymbol = {} as ts.Symbol;
    const setCountSymbol = {} as ts.Symbol;
    const ownerComponentFunction = {} as ts.FunctionDeclaration;

    const root: DrillerRoot = {
      children: [],
      getter: new Set([countSymbol]),
      setter: new Set([setCountSymbol]),
      name: "App",
      parent: null,
      source: {
        column: 1,
        file: "doesnt matter",
        line: 1,
      },
      type: "root",
      usage: Usage.ForwardsGetter,
      ownerComponentFunction,
    };

    const panel: DrillerNode = {
      children: [],
      getter: new Set([countSymbol]),
      setter: new Set([setCountSymbol]),
      name: "Panel",
      parent: root,
      source: {
        column: 1,
        file: "doesnt matter",
        line: 1,
      },
      type: "node",
      usage: Usage.ForwardsGetter,
      ownerComponentFunction,
    };

    root.children.push(panel);

    const counter: DrillerNode = {
      children: [],
      getter: new Set([countSymbol]),
      setter: new Set([setCountSymbol]),
      name: "Counter",
      parent: panel,
      source: {
        column: 1,
        file: "doesnt matter",
        line: 1,
      },
      type: "node",
      usage: Usage.ForwardsGetter,
      ownerComponentFunction,
    };

    panel.children.push(counter);

    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(panel);

    expect(panel.parent).toBe(root);
    expect(panel.children).toHaveLength(1);
    expect(panel.children[0]).toBe(counter);

    expect(counter.parent).toBe(panel);
    expect(counter.children).toHaveLength(0);
  });
});
