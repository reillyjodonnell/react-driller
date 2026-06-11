import path from "node:path";
import {
  retrieveLeastCommonAncestorFromRoot,
  scanNode,
  useStateExtractor,
} from "./analyzer";
import { Usage, type DrillerNode, type DrillerRoot } from "./node";
import { generateSetup } from "./setup";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

function formatLocation(source: { file: string; line: number; column: number }) {
  const rel = path.relative(process.cwd(), source.file);
  return `${rel}:${source.line}:${source.column}`;
}

function stateName(root: DrillerRoot): string {
  const [first] = [...root.getter];
  return first?.getName() ?? "<anonymous>";
}

function usageTag(usage: number): string {
  const parts: string[] = [];
  if (usage & Usage.Gets) parts.push("reads");
  if (usage & Usage.Sets) parts.push("writes");
  return parts.length ? `(${parts.join(", ")})` : "";
}

function renderTree(
  root: DrillerRoot,
  lca: DrillerRoot | DrillerNode,
  basePad: string,
) {
  function render(
    node: DrillerRoot | DrillerNode,
    prefix: string,
    connector: string,
  ) {
    const isRoot = node === root;
    const isLcaMove = node === lca && lca !== root;
    const segments: string[] = [bold(node.name)];

    if (isRoot) {
      segments.push(
        `${cyan("◆ useState")} ${dim(formatLocation(node.source))}`,
      );
    }
    if (isLcaMove) {
      segments.push(
        `${yellow("★ move here")} ${dim(formatLocation(node.source))}`,
      );
    }
    const tag = usageTag(node.usage);
    if (tag) segments.push(dim(tag));

    console.log(`${basePad}${dim(prefix + connector)}${segments.join("  ")}`);

    const childPrefix =
      prefix + (connector === "└─ " ? "   " : connector === "├─ " ? "│  " : "");
    node.children.forEach((child, i) => {
      const isLast = i === node.children.length - 1;
      render(child, childPrefix, isLast ? "└─ " : "├─ ");
    });
  }
  render(root, "", "");
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
    console.log(`  ${bold(component)}  ${dim(formatLocation(componentRoots[0]!.source))}`);
    console.log();

    for (const root of componentRoots) {
      const lca = retrieveLeastCommonAncestorFromRoot(root);
      const name = stateName(root);

      if (lca === root) {
        console.log(
          `    ${dim(`✓ checked \`${name}\` ${formatLocation(root.source)}`)}`,
        );
        console.log();
        continue;
      }

      console.log(
        `    ${yellow("move:")} ${bold(`\`${name}\``)} from ${bold(root.name)} ${dim(formatLocation(root.source))} to ${bold(lca.name)} ${dim(formatLocation(lca.source))}`,
      );
      console.log();
      renderTree(root, lca, "      ");
      console.log();
    }
  }
}
