import path from "node:path";
import type ts from "typescript";
import {
  retrieveLeastCommonAncestorFromRoot,
  scanNode,
  useStateExtractor,
} from "./analyzer";
import type { DrillerNode, DrillerRoot } from "./node";
import { generateSetup } from "./setup";

export type Location = {
  file: string;
  line: number;
  column: number;
};

export type StateAnalysis = {
  name: string;
  location: Location;
  drilled: boolean;
  suggestedAncestor?: {
    name: string;
    location: Location;
  };
};

export type ComponentAnalysis = {
  name: string;
  location: Location;
  states: StateAnalysis[];
};

export type FileAnalysis = {
  file: string;
  components: ComponentAnalysis[];
};

export type AnalysisSummary = {
  filesScanned: number;
  statesFound: number;
  drillingFindings: number;
};

export type AnalysisResult = {
  files: FileAnalysis[];
  summary: AnalysisSummary;
};

function toRepoRelative(source: {
  file: string;
  line: number;
  column: number;
}): Location {
  return {
    file: path.relative(process.cwd(), source.file),
    line: source.line,
    column: source.column,
  };
}

function stateName(root: DrillerRoot): string {
  const [first] = [...root.getter];
  return first?.getName() ?? "<anonymous>";
}

function walkTree(root: DrillerRoot, checker: ts.TypeChecker) {
  const queue: Array<DrillerRoot | DrillerNode> = [root];
  while (queue.length) {
    const node = queue.shift();
    if (node) scanNode(node, checker, queue);
  }
}

export function analyzeFiles(filePaths: string[]): AnalysisResult {
  const { checker, sourceFiles } = generateSetup({ filePaths });

  const files: FileAnalysis[] = [];
  let filesScanned = 0;
  let statesFound = 0;
  let drillingFindings = 0;

  for (const [absPath, sourceFile] of sourceFiles) {
    filesScanned += 1;

    const roots = useStateExtractor(sourceFile, checker);

    for (const root of roots) {
      walkTree(root, checker);
    }

    const componentsByName = new Map<string, ComponentAnalysis>();

    for (const root of roots) {
      statesFound += 1;

      const lca = retrieveLeastCommonAncestorFromRoot(root);
      const drilled = lca !== root;
      if (drilled) drillingFindings += 1;

      const state: StateAnalysis = {
        name: stateName(root),
        location: toRepoRelative(root.source),
        drilled,
        ...(drilled
          ? {
              suggestedAncestor: {
                name: lca.name,
                location: toRepoRelative(lca.source),
              },
            }
          : {}),
      };

      const existing = componentsByName.get(root.name);
      if (existing) {
        existing.states.push(state);
      } else {
        componentsByName.set(root.name, {
          name: root.name,
          location: toRepoRelative(root.source),
          states: [state],
        });
      }
    }

    files.push({
      file: path.relative(process.cwd(), absPath),
      components: [...componentsByName.values()],
    });
  }

  return {
    files,
    summary: {
      filesScanned,
      statesFound,
      drillingFindings,
    },
  };
}
