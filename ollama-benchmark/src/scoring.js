// Automatic scoring for the three quality dimensions the assignment asks for:
//   - accuracy:    does the response contain the expected answer (whole-word)?
//   - consistency: do repeated runs agree with each other?
//   - relevance:   is the response on-topic and not bloated/empty?
//
// Accuracy uses WHOLE-WORD / phrase matching (not substring includes), so a
// short answer like "5" is not falsely matched inside "15". To keep this strict
// matching from producing false negatives on differently-phrased-but-correct
// answers, the datasets carry explicit `acceptable` variants (number words,
// unit forms like "40 km/h", currency forms like "$30", etc.).
//
// These are heuristics, not a graded human rubric. They are good enough to
// surface clear trends between techniques. For a final report you may also
// spot-check a sample by hand.

/** Normalize text for lenient matching. */
function normalize(text) {
  return text
    .toLowerCase()
    // Treat hyphens as spaces so "twenty-eight" and "twenty eight" match.
    .replace(/-/g, " ")
    .replace(/[\s]+/g, " ")
    .replace(/[.,!?;:'"()$]/g, "")
    .trim();
}

/**
 * Extract the final answer from a Chain-of-Thought response if it follows the
 * "Final answer: X" convention; otherwise return the whole response.
 */
export function extractFinalAnswer(response) {
  const match = response.match(/final answer\s*[:\-]\s*(.+)$/im);
  return match ? match[1].trim() : response;
}

/** Split normalized text into word tokens. */
function tokenize(text) {
  const norm = normalize(text);
  return norm.length === 0 ? [] : norm.split(" ");
}

/**
 * Whole-word phrase match: returns true if the sequence of words in `needle`
 * appears as a contiguous run of WHOLE words inside `haystack`.
 *
 * This replaces substring includes(), so:
 *   - "5" no longer matches inside "15" (no false positives)
 *   - a multi-word answer like "william shakespeare" still matches inside a
 *     sentence like "the author was william shakespeare"
 */
function containsPhrase(haystackTokens, needleTokens) {
  if (needleTokens.length === 0) return false;
  if (needleTokens.length > haystackTokens.length) return false;

  for (let i = 0; i <= haystackTokens.length - needleTokens.length; i++) {
    let matched = true;
    for (let j = 0; j < needleTokens.length; j++) {
      if (haystackTokens[i + j] !== needleTokens[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Accuracy: 1 if the expected answer (or any acceptable alternative) appears
 * as a whole word/phrase in the response, else 0. For CoT we look at the
 * extracted final answer first, then fall back to the full response.
 *
 * Matching is whole-word (token-based), not substring, so partial-number
 * false positives like "5" inside "15" are avoided. Because of this stricter
 * matching, the datasets carry explicit `acceptable` variants for answers that
 * are commonly phrased in more than one way.
 *
 * @returns {0|1}
 */
export function scoreAccuracy(item, response, technique) {
  const candidates = [item.expected, ...(item.acceptable ?? [])]
    .map((c) => tokenize(c))
    .filter((tokens) => tokens.length > 0);

  const haystackRaw =
    technique === "chainOfThought" ? extractFinalAnswer(response) : response;
  const haystackTokens = tokenize(haystackRaw);

  // Also check the full response (the answer may be in the reasoning even if
  // the "Final answer:" line was missing or malformed).
  const fullHaystackTokens = tokenize(response);

  return candidates.some(
    (needle) =>
      containsPhrase(haystackTokens, needle) ||
      containsPhrase(fullHaystackTokens, needle),
  )
    ? 1
    : 0;
}

/**
 * Relevance heuristic (0-1):
 *   - empty responses score 0
 *   - very long, rambling responses are mildly penalized
 *   - responses that share keywords with the query score higher
 * This rewards on-topic, appropriately-sized answers.
 */
export function scoreRelevance(item, response) {
  if (!response || response.trim().length === 0) return 0;

  const queryWords = new Set(
    normalize(item.query)
      .split(" ")
      .filter((w) => w.length > 3),
  );
  const responseWords = normalize(response).split(" ");
  const responseWordSet = new Set(responseWords);

  let overlap = 0;
  for (const w of queryWords) if (responseWordSet.has(w)) overlap++;
  const keywordScore =
    queryWords.size > 0 ? overlap / queryWords.size : 1;

  // Length sanity: penalize extreme verbosity (likely off-topic rambling).
  // ~300 words is a generous ceiling for these short Q&A items.
  const lengthPenalty = responseWords.length > 300 ? 0.7 : 1;

  // Blend: keyword overlap matters but we don't want to over-penalize a
  // correct terse answer that reuses few query words. Floor at 0.3 if non-empty.
  const blended = Math.max(0.3, keywordScore) * lengthPenalty;
  return Number(blended.toFixed(3));
}

/**
 * Consistency across repeated runs for one (query x technique) cell.
 * We compute the fraction of runs whose accuracy equals the majority outcome.
 * 1.0 means every run agreed (all correct OR all wrong) -> stable behavior.
 *
 * @param {number[]} accuracyScores - array of 0/1 across repetitions
 * @returns {number} 0-1
 */
export function scoreConsistency(accuracyScores) {
  if (accuracyScores.length <= 1) return 1;
  const correct = accuracyScores.filter((s) => s === 1).length;
  const wrong = accuracyScores.length - correct;
  const majority = Math.max(correct, wrong);
  return Number((majority / accuracyScores.length).toFixed(3));
}

/** Average helper. */
export function mean(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
