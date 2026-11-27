// main.ts - entrypoint for the diff-speed-01-run-20261126 entry.
// Reads /input/cases.json (or $MAKEFUN_INPUT_DIR), answers each case with run() from
// solve.js, writes /output/answers.json (or $MAKEFUN_OUTPUT_DIR). Node 22 stdlib only.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off before solve.js is imported, like the house baseline:
// all of the entry's work then runs under it.
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (.js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Case = { id: string; input: unknown };

/** Answer every case with solve.js's run(), in the cases' order. */
function answerAll(cases: Case[]): unknown[] {
  const answers: unknown[] = [];
  for (const c of cases) answers.push(run(c.input));
  return answers;
}

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as Case[];
const answers = answerAll(cases);
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
