import ts from "typescript";
export type UsageFlags = number;

export function hasSet(usage: UsageFlags) {
  return (usage & Usage.Sets) !== 0;
}

export function hasGet(usage: UsageFlags) {
  return (usage & Usage.Gets) !== 0;
}

export function hasGetOrSet(usage: UsageFlags) {
  return (usage & (Usage.Gets | Usage.Sets)) !== 0;
}

export function hasForwardedGetter(usage: UsageFlags) {
  return (usage & Usage.ForwardsGetter) !== 0;
}

export function hasForwardedSetter(usage: UsageFlags) {
  return (usage & Usage.ForwardsSetter) !== 0;
}

export const Usage = {
  None: 0, // 00
  Gets: 1 << 0, // 01
  Sets: 1 << 1, // 10
  ForwardsGetter: 1 << 2, // 100,
  ForwardsSetter: 1 << 3, // 1000,
} as const;

export type DrillerNode = {
  type: "node";
  name: string;
  ownerComponentFunction:
    | ts.FunctionDeclaration
    | ts.ArrowFunction
    | ts.FunctionExpression;
  parent: DrillerRoot | DrillerNode | null;
  children: Array<DrillerNode>;
  source: {
    file: string;
    line: number;
    column: number;
  };
  getter: Set<ts.Symbol>;
  setter: Set<ts.Symbol>;
  usage: UsageFlags;
  jsxElement: ts.JsxOpeningLikeElement | null;
};

export function createDrillerNode({
  name,
  parent,
  ownerComponentFunction,
  jsxElement,
  source,
}: Pick<
  DrillerNode,
  "name" | "parent" | "ownerComponentFunction" | "jsxElement" | "source"
>): DrillerNode {
  return {
    type: "node",
    name,
    parent,
    children: [],
    source,
    getter: new Set(),
    setter: new Set(),
    usage: Usage.None,
    ownerComponentFunction,
    jsxElement,
  };
}

export function createRootDrillerNode({
  name,
  ownerComponentFunction,
}: Pick<DrillerRoot, "name" | "ownerComponentFunction">): DrillerRoot {
  return {
    type: "root",
    name,
    parent: null,
    children: [],
    source: {
      column: 0,
      file: "",
      line: 0,
    },
    getter: new Set(),
    setter: new Set(),
    usage: Usage.None,
    ownerComponentFunction,
    jsxElement: null,
  };
}

export type DrillerRoot = Omit<DrillerNode, "parent" | "type"> & {
  parent: null;
  type: "root";
};
