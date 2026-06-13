import {
  type AnalysisResult,
  type ComponentAnalysis,
  type Location,
  type StateAnalysis,
  analyzeFiles,
} from "./analysis";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function formatLocation(location: Location) {
  return `${location.file}:${location.line}:${location.column}`;
}

function verdict(component: ComponentAnalysis, state: StateAnalysis): string {
  if (!state.suggestedAncestor) {
    return `${green("✓")} in ${bold(component.name)}`;
  }
  const ancestor = state.suggestedAncestor;
  return `${bold(component.name)} ${yellow("→")} ${bold(ancestor.name)}  ${dim(formatLocation(ancestor.location))}`;
}

function renderComponent(component: ComponentAnalysis) {
  console.log(`  ${bold(component.name)}  ${dim(formatLocation(component.location))}`);
  console.log();

  type Row = {
    loc: string;
    name: string;
    verdict: string;
  };

  const rows: Row[] = component.states.map((state) => ({
    loc: formatLocation(state.location),
    name: state.name,
    verdict: verdict(component, state),
  }));

  const locWidth = Math.max(...rows.map((r) => r.loc.length));
  const nameWidth = Math.max(...rows.map((r) => r.name.length + 2)); // backticks

  for (const row of rows) {
    const locCol = dim(row.loc.padEnd(locWidth));
    const nameCol = `\`${row.name}\``.padEnd(nameWidth);
    console.log(`    ${locCol}  ${nameCol}  ${row.verdict}`);
  }
  console.log();
}

export function renderText(result: AnalysisResult) {
  let anyComponents = false;

  for (const file of result.files) {
    if (file.components.length === 0) continue;

    anyComponents = true;

    console.log(`  ${dim(file.file)}`);
    console.log();

    for (const component of file.components) {
      renderComponent(component);
    }
  }

  if (!anyComponents) {
    console.log(`  ${dim("no useState calls found")}`);
    console.log();
  }
}

export function startEngine(filePaths: string[]): AnalysisResult {
  const result = analyzeFiles(filePaths);
  renderText(result);
  return result;
}
