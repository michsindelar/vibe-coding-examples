// Human-in-the-loop review pass.
//
// After the benchmark runs, the automatic matcher will have marked some
// responses as non-matching (accuracy 0). Some of those are genuinely wrong;
// others are correct but phrased in a way no `acceptable` variant covered.
// This module lets the user grade those non-matches so false negatives can be
// corrected, and optionally remembers accepted phrasings for next time.
//
// Design:
//   - Only NON-matched, error-free runs are reviewed (matches auto-pass).
//   - Identical (queryId, response) pairs are graded once and applied to all
//     occurrences, so repeated/identical answers aren't re-asked.
//   - After grading, affected cell aggregates are recomputed.
//   - Newly-accepted phrasings can be saved back into the dataset JSON.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { config } from "./config.js";
import { DATA_DIR } from "./testSet.js";
import { recomputeCellAggregates } from "./runner.js";

/** Should the review pass run, given config + environment? */
export function shouldReview() {
  const mode = config.manualReview;
  if (mode === "off") return false;
  if (mode === "on") return true;
  // "auto": only when interactive.
  return Boolean(stdin.isTTY);
}

/**
 * Collect unique non-matched responses needing review.
 * @returns {Array<{key:string, queryId:string, category:string, query:string,
 *   expected:string, response:string, runs:object[]}>}
 */
function collectNonMatches(cells) {
  const groups = new Map();

  for (const cell of cells) {
    for (const run of cell.runs) {
      // Skip auto-matched responses and errored runs (nothing to grade).
      if (run.autoMatched || run.error) continue;
      if (!run.response || run.response.trim().length === 0) continue;

      // Group identical responses for the same query so we ask only once.
      const key = `${cell.queryId}\u0000${run.response.trim()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          queryId: cell.queryId,
          category: cell.category,
          query: cell.query,
          expected: cell.expected,
          response: run.response,
          runs: [],
        });
      }
      groups.get(key).runs.push(run);
    }
  }

  return [...groups.values()];
}

/**
 * Trim a long response for display while ALWAYS preserving the end, where
 * conclusions and "Final answer:" lines live. Short responses show in full;
 * long ones show the head and the tail with a marker in between, so the actual
 * answer is never cut off during review.
 */
function truncate(text, max = 1200) {
  const t = text.trim();
  if (t.length <= max) return t;

  // Reserve more room for the tail (the answer) than the head (the setup).
  const headLen = Math.floor(max * 0.4);
  const tailLen = max - headLen;
  const head = t.slice(0, headLen).trimEnd();
  const tail = t.slice(t.length - tailLen).trimStart();
  const omitted = t.length - headLen - tailLen;

  return `${head}\n  ...[${omitted} chars omitted]...\n  ${tail}`;
}

/**
 * Run the interactive review pass. Mutates run.accuracy / run.manualGrade and
 * recomputes affected cell aggregates. Returns a summary + accepted phrasings.
 *
 * @returns {Promise<{reviewed:number, markedCorrect:number, markedWrong:number,
 *   skipped:number, acceptedPhrasings: Map<string, Set<string>>}>}
 */
export async function runManualReview(results) {
  const groups = collectNonMatches(results.cells);

  if (groups.length === 0) {
    console.log("\nManual review: nothing to review (all responses matched).");
    return {
      reviewed: 0,
      markedCorrect: 0,
      markedWrong: 0,
      skipped: 0,
      acceptedPhrasings: new Map(),
    };
  }

  if (!stdin.isTTY) {
    console.log(
      `\nManual review: ${groups.length} unique non-matching response(s) ` +
        `would need grading, but stdin is not interactive. Skipping ` +
        `(they remain scored as 0). Set MANUAL_REVIEW=off to silence this.`,
    );
    return {
      reviewed: 0,
      markedCorrect: 0,
      markedWrong: 0,
      skipped: groups.length,
      acceptedPhrasings: new Map(),
    };
  }

  console.log("\n" + "=".repeat(64));
  console.log(
    `MANUAL REVIEW — ${groups.length} unique response(s) the auto-matcher ` +
      `did not accept`,
  );
  console.log(
    "For each, mark: [y] correct  [n] wrong  [s] skip  [q] quit review",
  );
  console.log("=".repeat(64));

  const rl = createInterface({ input: stdin, output: stdout });
  // queryId -> Set of phrasings the user accepted as correct.
  const acceptedPhrasings = new Map();
  let markedCorrect = 0;
  let markedWrong = 0;
  let skipped = 0;
  let reviewed = 0;
  let quit = false;

  try {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];

      if (quit) {
        skipped += g.runs.length;
        continue;
      }

      console.log(`\n[${i + 1}/${groups.length}] ${g.queryId} (${g.category})`);
      console.log(`  Q: ${g.query}`);
      console.log(`  Expected: ${g.expected}`);
      console.log(`  Model answered:\n  "${truncate(g.response)}"`);

      let verdict = null;
      while (verdict === null) {
        const ans = (await rl.question("  Correct? [y/n/s/q]: "))
          .trim()
          .toLowerCase();
        if (["y", "yes"].includes(ans)) verdict = "y";
        else if (["n", "no"].includes(ans)) verdict = "n";
        else if (["s", "skip", ""].includes(ans)) verdict = "s";
        else if (["q", "quit"].includes(ans)) verdict = "q";
        else console.log('  Please enter "y", "n", "s", or "q".');
      }

      if (verdict === "q") {
        quit = true;
        skipped += g.runs.length;
        continue;
      }
      if (verdict === "s") {
        skipped += g.runs.length;
        continue;
      }

      // Apply the grade to every run that produced this exact response.
      const isCorrect = verdict === "y";
      for (const run of g.runs) {
        run.manualGrade = isCorrect ? 1 : 0;
        run.accuracy = isCorrect ? 1 : 0;
      }
      reviewed += g.runs.length;
      if (isCorrect) {
        markedCorrect += g.runs.length;
        // Remember the phrasing for optional save-back.
        if (!acceptedPhrasings.has(g.queryId)) {
          acceptedPhrasings.set(g.queryId, new Set());
        }
        acceptedPhrasings.get(g.queryId).add(g.response.trim());
      } else {
        markedWrong += g.runs.length;
      }
    }
  } finally {
    rl.close();
  }

  // Recompute aggregates for any cell whose runs changed.
  for (const cell of results.cells) {
    recomputeCellAggregates(cell);
  }

  console.log(
    `\nManual review done: ${markedCorrect} run(s) marked correct, ` +
      `${markedWrong} wrong, ${skipped} skipped.`,
  );

  return { reviewed, markedCorrect, markedWrong, skipped, acceptedPhrasings };
}

/**
 * Offer to persist accepted phrasings as new `acceptable` variants in the
 * per-category dataset JSON files.
 *
 * @param {Map<string, Set<string>>} acceptedPhrasings  queryId -> phrasings
 * @param {object[]} testSet  the in-memory test set (for id -> category)
 */
export async function offerSavePhrasings(acceptedPhrasings, testSet) {
  if (acceptedPhrasings.size === 0) return;
  if (!stdin.isTTY) return;

  const totalPhrasings = [...acceptedPhrasings.values()].reduce(
    (n, set) => n + set.size,
    0,
  );

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ans = (
      await rl.question(
        `\nSave ${totalPhrasings} newly-accepted phrasing(s) to the dataset ` +
          `so future runs match them automatically? [y/N]: `,
      )
    )
      .trim()
      .toLowerCase();
    if (!["y", "yes"].includes(ans)) {
      console.log("Not saving. Manual grades still apply to this run.");
      return;
    }
  } finally {
    rl.close();
  }

  // Group target items by category file.
  const byId = new Map(testSet.map((t) => [t.id, t]));
  const byFile = new Map(); // fileName -> [{ id, phrasings }]

  for (const [queryId, phrasings] of acceptedPhrasings) {
    const item = byId.get(queryId);
    if (!item) continue;
    const fileName = `${item.category}.json`;
    if (!byFile.has(fileName)) byFile.set(fileName, []);
    byFile.get(fileName).push({ id: queryId, phrasings });
  }

  let savedCount = 0;
  for (const [fileName, edits] of byFile) {
    const filePath = join(DATA_DIR, fileName);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    const dataById = new Map(data.map((d) => [d.id, d]));

    for (const { id, phrasings } of edits) {
      const entry = dataById.get(id);
      if (!entry) continue;
      const existing = new Set(
        (entry.acceptable ?? []).map((s) => s.toLowerCase()),
      );
      for (const p of phrasings) {
        if (
          p.toLowerCase() !== entry.expected.toLowerCase() &&
          !existing.has(p.toLowerCase())
        ) {
          entry.acceptable = [...(entry.acceptable ?? []), p];
          existing.add(p.toLowerCase());
          savedCount++;
        }
      }
    }

    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  console.log(
    `Saved ${savedCount} phrasing(s) across ${byFile.size} dataset file(s).`,
  );
}
