import type { ts } from "ts-morph";

export type UsageFlags = number;

export const Usage = {
  None: 0, // 00
  Gets: 1 << 0, // 01
  Sets: 1 << 1, // 10
  Forwards: 1 << 2, // 100
} as const;

export function addGet(flags: UsageFlags) {
  return flags | Usage.Gets;
}

export function addSet(flags: UsageFlags) {
  return flags | Usage.Sets;
}

export function hasGet(flags: UsageFlags) {
  return (flags & Usage.Gets) !== 0;
}

export function hasSet(flags: UsageFlags) {
  return (flags & Usage.Sets) !== 0;
}

export function addForward(flags: UsageFlags) {
  return flags | Usage.Forwards;
}

export function hasForward(flags: UsageFlags) {
  return (flags & Usage.Forwards) !== 0;
}

export type DrillerNode = {
  type: "node";
  name: string;
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
};

export type DrillerRoot = Omit<DrillerNode, "parent" | "type"> & {
  parent: null;
  type: "root";
};
