/**
 * Pure exit-code policy for the `--fail-on <level>` flag.
 *
 * Kept free of side effects: no `process.exit`, no `console`. The CLI layer
 * owns reading the flag, printing errors, and setting `process.exitCode`; this
 * module only decides the numeric exit code and validates the level string.
 */

export const FAIL_ON_LEVELS = ["none", "findings"] as const;

export type FailOnLevel = (typeof FAIL_ON_LEVELS)[number];

/**
 * The minimum shape `exitCodeFor` reads from an analysis result. Anything that
 * exposes `summary.drillingFindings` satisfies it, so the pure function never
 * depends on the full analysis data structure.
 */
export interface DrillingSummary {
  summary: { drillingFindings: number };
}

export type FailOnValidation =
  | { ok: true; level: FailOnLevel }
  | { ok: false; raw: string; validLevels: readonly FailOnLevel[] };

function isFailOnLevel(raw: string): raw is FailOnLevel {
  return (FAIL_ON_LEVELS as readonly string[]).includes(raw);
}

/**
 * Validate a raw `--fail-on` value without throwing. Callers branch on `ok`
 * and emit their own stderr message / exit on the error case.
 */
export function validateFailOnLevel(raw: string): FailOnValidation {
  if (isFailOnLevel(raw)) {
    return { ok: true, level: raw };
  }
  return { ok: false, raw, validLevels: FAIL_ON_LEVELS };
}

/**
 * Map an analysis result to a process exit code under the given level.
 *
 * - `none`: always 0, even when drilling findings exist (today's behavior).
 * - `findings`: 1 when there is at least one drilling finding, else 0.
 */
export function exitCodeFor(
  result: DrillingSummary,
  failOn: FailOnLevel,
): number {
  switch (failOn) {
    case "none":
      return 0;
    case "findings":
      return result.summary.drillingFindings >= 1 ? 1 : 0;
  }
}
