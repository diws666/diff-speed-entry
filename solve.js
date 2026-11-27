// solve.js - diff-speed-01-run-20261126 entry (my own writing).
// Dependency-free ES module exporting run(input) -> makefun-diff/1 patch string.
//
// Exact semantics of makefun-diff 1.0.0 (derived from jsdiff 9.0.0's Myers line diff,
// deletion wins ties, no edge-diagonal pruning), re-implemented from the published rule
// (the kit's RULES.txt), not copied from the vendor source.
//
// Speed measures: lines interned to integer ids once (int compares in the hot loop),
// Myers's greedy search over flat diagonal arrays, common prefix/suffix trimmed before
// the search, identical texts short-cut to the header line, single-pass patch rendering
// joined at the end. No public diff libraries, no vendor code copied.

const FORMAT = 'makefun-diff/1';
const CONTEXT = 3;

const KEEP = '=';
const DELETE = '-';
const INSERT = '+';

function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(parts[i] + '\n');
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

export function run(input) {
  if (input === null || typeof input !== 'object' ||
      typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }

  const a = tokenize(input.old);
  const b = tokenize(input.new);
  const n = a.length;
  const m = b.length;

  // Intern every line to an integer id; after this, line equality is integer equality.
  const map = new Map();
  const idA = new Int32Array(n);
  const idB = new Int32Array(m);
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    let id = map.get(a[i]);
    if (id === undefined) { id = nextId++; map.set(a[i], id); }
    idA[i] = id;
  }
  for (let i = 0; i < m; i++) {
    let id = map.get(b[i]);
    if (id === undefined) { id = nextId++; map.set(b[i], id); }
    idB[i] = id;
  }

  // Common prefix, then common suffix of what is left (on ids, same result as strings).
  let prefix = 0;
  while (prefix < n && prefix < m && idA[prefix] === idB[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix &&
         idA[n - 1 - suffix] === idB[m - 1 - suffix]) suffix++;

  const oldLen = n - prefix - suffix;
  const newLen = m - prefix - suffix;

  // Slices over which Myers runs (plain arrays: faster random access than typed views).
  const A = [];
  for (let i = prefix; i < n - suffix; i++) A.push(idA[i]);
  const B = [];
  for (let i = prefix; i < m - suffix; i++) B.push(idB[i]);

  // Myers's greedy search (after jsdiff 9.0.0 base.js).
  // Positions are local to the slices: oldPos is the last old line consumed (-1 = none).
  // On diagonal k = oldPos - newPos the path furthest into the old text is kept; when
  // a deletion and an insertion reach the same point, the deletion wins. No edge-diagonal
  // pruning; every run of equal lines is followed as far as it goes.
  const maxEdit = oldLen + newLen;
  const offset = maxEdit + 1;
  const bestPath = new Array(2 * maxEdit + 3);

  function addToPath(path, kind, oldPosInc) {
    const last = path.lastComponent;
    if (last !== undefined && last.kind === kind) {
      return { oldPos: path.oldPos + oldPosInc, lastComponent: { count: last.count + 1, kind, previousComponent: last.previousComponent } };
    }
    return { oldPos: path.oldPos + oldPosInc, lastComponent: { count: 1, kind, previousComponent: last } };
  }

  function extractCommon(path, newTokens, oldTokens, diagonal) {
    const newLen = newTokens.length;
    const oldLen = oldTokens.length;
    let oldPos = path.oldPos;
    let newPos = oldPos - diagonal;
    let common = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && oldTokens[oldPos + 1] === newTokens[newPos + 1]) {
      newPos++; oldPos++; common++;
    }
    if (common > 0) path.lastComponent = { count: common, kind: KEEP, previousComponent: path.lastComponent };
    path.oldPos = oldPos;
    return newPos;
  }

  bestPath[offset] = { oldPos: -1, lastComponent: undefined };
  let newPos = extractCommon(bestPath[offset], B, A, 0);
  if (bestPath[offset].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
    // only the common prefix/suffix: empty middle edit script
    return render(n, m, a, b, [{ kind: KEEP, count: prefix > 0 ? prefix : 0 }, ...(suffix > 0 ? [{ kind: KEEP, count: suffix }] : [])]);
  }

  for (let d = 1; d <= maxEdit; d++) {
    for (let k = -d; k <= d; k += 2) {
      const removePath = bestPath[offset + k - 1];
      const addPath = bestPath[offset + k + 1];
      // Nothing else reads diagonal k - 1 at this d (k - 2 read it as its insertion's path already).
      if (removePath !== undefined) bestPath[offset + k - 1] = undefined;
      const canRemove = removePath !== undefined && removePath.oldPos + 1 < oldLen;
      const canAdd = addPath !== undefined && addPath.oldPos - k < newLen;
      if (!canRemove && !canAdd) {
        bestPath[offset + k] = undefined;
        continue;
      }
      // make.fun's tie-break: the candidate further into the old text, and the deletion
      // when both reach one point.
      const byDeletion = canRemove ? removePath.oldPos + 1 : -2;
      const byInsertion = canAdd ? addPath.oldPos : -2;
      const path = byDeletion >= byInsertion ? addToPath(removePath, DELETE, 1) : addToPath(addPath, INSERT, 0);
      newPos = extractCommon(path, B, A, k);
      if (path.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
        return render(n, m, a, b, finishRuns(path.lastComponent, prefix, suffix));
      }
      bestPath[offset + k] = path;
    }
  }
  throw new Error('makefun-diff: the search ended without reaching both ends');
}

function finishRuns(lastComponent, prefix, suffix) {
  const runs = [];
  for (let c = lastComponent; c !== undefined; c = c.previousComponent) runs.push({ kind: c.kind, count: c.count });
  runs.reverse();
  const out = [];
  if (prefix > 0) out.push({ kind: '=', count: prefix });
  out.push(...runs);
  if (suffix > 0) out.push({ kind: '=', count: suffix });
  return out;
}

function render(n, m, a, b, runs) {
  // The change runs: each a stretch of deletions and insertions between two kept lines,
  // at old line o and new line p (absolute positions over the full texts).
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === '=') { o += r.count; p += r.count; continue; }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === '-') { c.dels += r.count; o += r.count; deleted += r.count; }
    else { c.ins += r.count; p += r.count; inserted += r.count; }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one hunk.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h === undefined ? undefined : h[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  // Render the patch in one pass.
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  const written = (op, line) => line.endsWith('\n') ? `${op}${line}` : `${op}${line}\n%\n`;
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = first.o > CONTEXT ? first.o - CONTEXT : 0;
    const newStart = first.p - (first.o - oldStart);
    const after = n - (last.o + last.dels);
    const aft = after > CONTEXT ? CONTEXT : after;
    const oldEnd = last.o + last.dels + aft;
    const newEnd = last.p + last.ins + aft;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at]));
  }
  return out.join('');
}
