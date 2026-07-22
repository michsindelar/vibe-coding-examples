// Orchestrates the benchmark: for each technique, for each query, run N
// repetitions, score them, and collect structured results.

import { config } from "./config.js";
import { testSet } from "./testSet.js";
import { techniques } from "./techniques.js";
import { generate } from "./ollamaClient.js";
import {
  scoreAccuracy,
  scoreRelevance,
  scoreConsistency,
  mean,
} from "./scoring.js";

/**
 * Run the full benchmark.
 * @returns {Promise<object>} structured results for reporting
 */
export async function runBenchmark() {
  const startedAt = new Date();
  const cells = []; // one entry per (technique x query)

  const activeTechniques = config.techniques.filter((t) => techniques[t]);

  let cellNumber = 0;
  const totalCells = activeTechniques.length * testSet.length;

  for (const techniqueName of activeTechniques) {
    const buildPrompt = techniques[techniqueName];

    for (const item of testSet) {
      cellNumber++;
      const prompt = buildPrompt(item);
      const runs = [];

      process.stdout.write(
        `[${cellNumber}/${totalCells}] ${techniqueName} :: ${item.id} `,
      );

      for (let r = 0; r < config.repetitions; r++) {
        try {
          const { response, totalDurationMs } = await generate(prompt);
          const accuracy = scoreAccuracy(item, response, techniqueName);
          runs.push({
            run: r + 1,
            response,
            accuracy,
            // Did the automatic matcher accept this response? Distinct from
            // `accuracy`, which a later manual review pass may override.
            autoMatched: accuracy === 1,
            // null until (and unless) a human grades it during manual review.
            manualGrade: null,
            relevance: scoreRelevance(item, response),
            durationMs: totalDurationMs,
            error: null,
          });
          process.stdout.write(accuracy === 1 ? "." : "x");
        } catch (err) {
          runs.push({
            run: r + 1,
            response: "",
            accuracy: 0,
            autoMatched: false,
            manualGrade: null,
            relevance: 0,
            durationMs: null,
            error: err.message,
          });
          process.stdout.write("!");
        }
      }
      process.stdout.write("\n");

      const cell = {
        technique: techniqueName,
        queryId: item.id,
        category: item.category,
        query: item.query,
        expected: item.expected,
        prompt,
        runs,
      };
      recomputeCellAggregates(cell);
      cells.push(cell);
    }
  }

  return {
    meta: {
      model: config.model,
      ollamaUrl: config.ollamaUrl,
      repetitions: config.repetitions,
      options: config.options,
      techniques: activeTechniques,
      queryCount: testSet.length,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    },
    cells,
  };
}

/**
 * (Re)compute the per-cell aggregate metrics from its runs. Called once after
 * the benchmark and again after manual review may have changed `accuracy`.
 * Mutates the cell in place.
 */
export function recomputeCellAggregates(cell) {
  const runs = cell.runs;
  const accuracyScores = runs.map((x) => x.accuracy);
  cell.accuracy = mean(accuracyScores); // fraction of runs correct
  cell.relevance = mean(runs.map((x) => x.relevance));
  cell.consistency = scoreConsistency(accuracyScores);
  cell.avgDurationMs = avg(
    runs.map((x) => x.durationMs).filter((d) => d != null),
  );
  return cell;
}

function avg(nums) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
