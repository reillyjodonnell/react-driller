import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git",
  "coverage",
  ".turbo",
  ".cache",
]);

function segmentsOf(filePath: string): string[] {
  return path
    .normalize(filePath)
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0 && segment !== ".");
}

function hasSourceExtension(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function fallsUnderIgnoredDir(segments: string[]): boolean {
  return segments.slice(0, -1).some((segment) => IGNORED_DIRS.has(segment));
}

function isUnderRoot(fileSegments: string[], root: string): boolean {
  const rootSegments = segmentsOf(root);
  if (rootSegments.length === 0) return true;
  if (fileSegments.length <= rootSegments.length) return false;
  return rootSegments.every(
    (segment, index) => fileSegments[index] === segment,
  );
}

/**
 * Pure file-set filter shared by the `--diff` path. Mirrors the directory
 * walk's SOURCE_EXTENSIONS + IGNORED_DIRS rules, then (when roots is
 * non-empty) keeps only paths contained under at least one root via
 * segment-wise containment so prefix accidents like `src` vs `srcfoo`
 * do not leak through. Performs no git calls and no filesystem reads.
 */
export function filterChangedFiles(
  changedPaths: string[],
  roots: string[],
): string[] {
  return changedPaths.filter((changedPath) => {
    if (!hasSourceExtension(changedPath)) return false;

    const segments = segmentsOf(changedPath);
    if (fallsUnderIgnoredDir(segments)) return false;

    if (roots.length === 0) return true;
    return roots.some((root) => isUnderRoot(segments, root));
  });
}
