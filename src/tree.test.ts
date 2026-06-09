import { describe, it, expect } from "bun:test";
import { Usage, type DrillerNode, type DrillerRoot } from "./node";
import type { ts } from "ts-morph";
import { collectConsumers } from "./tree";

describe("tree", () => {
  it("can collect only nodes that use get / set given below structure: ", () => {
    /*
      App
      └─ Panel [forwards]
          └─ Counter [gets | sets]
    */

    const countSymbol = {} as ts.Symbol;
    const setCountSymbol = {} as ts.Symbol;

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
      usage: Usage.Forwards,
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
      usage: Usage.Forwards,
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
      usage: Usage.Gets | Usage.Sets,
    };

    panel.children.push(counter);

    const nodes = collectConsumers(root);
    expect(nodes.size).toBe(1);
    expect(nodes.has(counter)).toBe(true);
    expect(nodes.has(root)).toBe(false);
    expect(nodes.has(panel)).toBe(false);
  });
});
