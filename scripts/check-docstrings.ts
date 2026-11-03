#!/usr/bin/env bun
/**
 * Docstring coverage gate, scoped to the functions a change actually touches.
 *
 * Mirrors the metric CodeRabbit's "Docstring Coverage" pre-merge check applies,
 * so the number is settled here — in a command anyone can run and debug —
 * rather than arriving as a review comment after the PR is open.
 *
 * Scoped to touched functions on purpose. The repo sits near 29% overall, so a
 * whole-tree rule would fail on ~168 pre-existing functions and teach everyone
 * to ignore it. Touching a function is the moment its documentation is cheapest
 * to write, and it is the only moment this gate asks for it.
 *
 * Usage: bun scripts/check-docstrings.ts [baseRef]
 *   baseRef defaults to $GITHUB_BASE_REF, then origin/develop.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import ts from "typescript";

/** Matches the threshold pinned in `.coderabbit.yaml`; change both together. */
const THRESHOLD = 80;

const SOURCE = /^src\/.*\.tsx?$/;
/** Generated or fixture files nobody hand-documents. */
const EXEMPT = /(\.test\.tsx?|routeTree\.gen\.ts|types\.gen\.ts|^src\/components\/ui\/)/;

function git(...args: string[]): string {
  const { stdout, status, stderr } = spawnSync("git", args, { encoding: "utf8" });
  if (status !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  return stdout;
}

/**
 * The merge base against the target branch.
 *
 * Diffing against the base *tip* would attribute every function touched on the
 * base since this branch started to this change. The merge base is the point
 * the branch actually diverged, which is the set the author is answerable for.
 */
function resolveBase(): string {
  const explicit = process.argv[2] ?? process.env["GITHUB_BASE_REF"];
  const candidates = explicit
    ? [explicit, `origin/${explicit}`]
    : ["origin/develop", "origin/main"];
  for (const ref of candidates) {
    const { status } = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      encoding: "utf8",
    });
    if (status === 0) return git("merge-base", "HEAD", ref).trim();
  }
  throw new Error(`No usable base ref among: ${candidates.join(", ")}`);
}

/** Line numbers (1-indexed) added or modified in each changed source file. */
function changedLines(base: string): Map<string, Set<number>> {
  const diff = git("diff", "--unified=0", "--diff-filter=ACM", base, "--", "src");
  const out = new Map<string, Set<number>>();
  let file = "";
  for (const line of diff.split("\n")) {
    const toFile = /^\+\+\+ b\/(.+)$/.exec(line);
    if (toFile?.[1]) {
      file = toFile[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !file || !SOURCE.test(file) || EXEMPT.test(file)) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const set = out.get(file) ?? new Set<number>();
    if (count === 0) {
      // A deletion-only hunk reads `+n,0`: nothing was added, and the removed
      // lines sat immediately after line n in the new file. Without this the
      // hunk records nothing, so a change that only deletes code from inside a
      // function leaves that function looking untouched.
      set.add(Math.max(start, 1));
    } else {
      for (let n = start; n < start + count; n++) set.add(n);
    }
    out.set(file, set);
  }
  return out;
}

type Fn = { name: string; line: number; endLine: number; documented: boolean };

/**
 * Top-level functions in a file, with the span each one covers.
 *
 * Uses the TypeScript parser rather than a line scanner. A scanner that finds a
 * function's end by counting braces cannot terminate on a concise arrow body —
 * `const f = (x) => x * 2;` opens no brace — so it ran to the end of the file
 * and swallowed every declaration below it, marking them touched by any edit.
 * The compiler computes exact spans and is already a dependency here.
 */
function functionsIn(path: string): Fn[] {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const fns: Fn[] = [];

  const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;

  /**
   * Whether a JSDoc block sits immediately above the declaration.
   *
   * Tests the opening delimiter, not the closing one. Every block comment ends
   * the same way, so matching the end counted an incidental `eslint-disable`
   * block — or any other plain block comment — as documentation.
   */
  function isDocumented(node: ts.Node): boolean {
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    const last = ranges.at(-1);
    if (last === undefined) return false;
    return text.slice(last.pos, last.pos + 3) === "/**";
  }

  function record(name: string, node: ts.Node): void {
    fns.push({
      name,
      line: lineOf(node.getStart(source)),
      endLine: lineOf(node.getEnd()),
      documented: isDocumented(node),
    });
  }

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      record(statement.name.text, statement);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    const declarations = statement.declarationList.declarations;
    for (const decl of declarations) {
      const init = decl.initializer;
      if (init === undefined) continue;
      if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
      if (!ts.isIdentifier(decl.name)) continue;
      // The docstring attaches to the statement, so a lone declaration is
      // measured from there. `const a = …, b = …` is one statement holding two
      // functions, and each then gets its own span.
      record(decl.name.text, declarations.length === 1 ? statement : decl);
    }
  }
  return fns;
}

const base = resolveBase();
const changed = changedLines(base);

const touched: { path: string; fn: Fn }[] = [];
for (const [path, lineNumbers] of changed) {
  for (const fn of functionsIn(path)) {
    if ([...lineNumbers].some((n) => n >= fn.line && n <= fn.endLine)) touched.push({ path, fn });
  }
}

if (touched.length === 0) {
  console.log(`No functions touched against ${base.slice(0, 7)}. Docstring check skipped.`);
  process.exit(0);
}

const undocumented = touched.filter((t) => !t.fn.documented);
const documented = touched.length - undocumented.length;

/**
 * Compared as integers so the gate cannot be cleared by rounding: 43 of 54 is
 * 79.6%, which `Math.round` reports as 80 and would have passed an 80% bar.
 * The rounded figure below is for reading only.
 */
const meetsThreshold = documented * 100 >= THRESHOLD * touched.length;
const coverage = Math.round((documented / touched.length) * 100);

console.log(
  `Docstring coverage on touched functions: ${coverage}% ` +
    `(${documented}/${touched.length}, threshold ${THRESHOLD}%)`,
);

if (undocumented.length > 0) {
  console.log("\nUndocumented:");
  for (const { path, fn } of undocumented) console.log(`  ${path}:${fn.line}  ${fn.name}`);
}

if (!meetsThreshold) {
  // `::error::` renders the failure on the PR's Files tab, not only in the log.
  console.log(
    `\n::error::Docstring coverage ${coverage}% is below the ${THRESHOLD}% threshold. ` +
      `Document the functions listed above, or narrow the change.`,
  );
  process.exit(1);
}
