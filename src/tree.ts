import { hasGet, hasSet, type DrillerNode, type DrillerRoot } from "./node";

export function collectConsumers(
  root: DrillerRoot,
): Set<DrillerRoot | DrillerNode> {
  const consumers = new Set<DrillerRoot | DrillerNode>();

  function walk(node: DrillerRoot | DrillerNode) {
    if (hasGet(node.usage) || hasSet(node.usage)) {
      consumers.add(node);
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);

  return consumers;
}
