import path from "node:path";
import {
  retrieveLeastCommonAncestorFromRoot,
  scanNode,
  useStateExtractor,
} from "./analyzer";
import type { DrillerNode, DrillerRoot } from "./node";
import { generateSetup } from "./setup";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function formatLocation(source: { file: string; line: number; column: number }) {
  const rel = path.relative(process.cwd(), source.file);
  return `${rel}:${source.line}:${source.column}`;
}

function stateName(root: DrillerRoot): string {
  const [first] = [...root.getter];
  return first?.getName() ?? "<anonymous>";
}

export function startEngine(filePath: string) {
  const { checker, sourceFile } = generateSetup({ filePath });

  const roots = useStateExtractor(sourceFile, checker);

  if (roots.length === 0) {
    console.log(`  ${dim("no useState calls found")}`);
    console.log();
    return;
  }

  for (const root of roots) {
    let queue: Array<DrillerRoot | DrillerNode> = [root];
    while (queue.length) {
      const node = queue.shift();
      if (node) scanNode(node, checker, queue);
    }
  }

  const groups = new Map<string, DrillerRoot[]>();
  for (const root of roots) {
    const existing = groups.get(root.name);
    if (existing) existing.push(root);
    else groups.set(root.name, [root]);
  }

  for (const [component, componentRoots] of groups) {
    console.log(
      `  ${bold(component)}  ${dim(formatLocation(componentRoots[0]!.source))}`,
    );
    console.log();

    type Row = {
      loc: string;
      name: string;
      verdict: string;
    };

    const rows: Row[] = componentRoots.map((root) => {
      const lca = retrieveLeastCommonAncestorFromRoot(root);
      const name = stateName(root);
      const loc = formatLocation(root.source);
      if (lca === root) {
        return {
          loc,
          name,
          verdict: `${green("✓")} in ${bold(root.name)}`,
        };
      }
      return {
        loc,
        name,
        verdict: `${bold(root.name)} ${yellow("→")} ${bold(lca.name)}  ${dim(formatLocation(lca.source))}`,
      };
    });

    const locWidth = Math.max(...rows.map((r) => r.loc.length));
    const nameWidth = Math.max(...rows.map((r) => r.name.length + 2)); // backticks

    for (const row of rows) {
      const locCol = dim(row.loc.padEnd(locWidth));
      const nameCol = `\`${row.name}\``.padEnd(nameWidth);
      console.log(`    ${locCol}  ${nameCol}  ${row.verdict}`);
    }
    console.log();
  }
}
