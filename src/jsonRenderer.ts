/**
 * Machine-readable renderer for the `--json` flag.
 *
 * Takes the structured {@link AnalysisResult} produced by {@link analyzeFiles}
 * and returns the exact string to print: a single JSON object, no ANSI color,
 * no extra text. Analysis lives in `analysis.ts`; this module only serializes
 * its output, so the drilling logic is never duplicated here.
 *
 * Every `file` and `location.file` field in `AnalysisResult` is already
 * repo-relative (run through `path.relative(process.cwd(), ...)` upstream), so
 * the serialized JSON inherits that guarantee with no further transformation.
 */

import type { AnalysisResult } from "./analysis";

export function renderJson(result: AnalysisResult): string {
  return JSON.stringify(result);
}
