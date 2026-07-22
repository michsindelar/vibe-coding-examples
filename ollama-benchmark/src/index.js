// Entry point: check connection, run the benchmark, print + save reports.
//
// Usage:
//   npm start
//   OLLAMA_MODEL=qwen2.5 OLLAMA_REPETITIONS=5 npm start

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "./config.js";
import { selectModel } from "./selectModel.js";
import { runBenchmark } from "./runner.js";
import { testSet, categoryCounts } from "./testSet.js";
import {
  shouldReview,
  runManualReview,
  offerSavePhrasings,
} from "./manualReview.js";
import {
  printConsoleReport,
  buildMarkdownReport,
} from "./report.js";

async function main() {
  console.log(`Ollama Prompt Engineering Benchmark`);
  console.log(`URL: ${config.ollamaUrl}`);
  const breakdown = Object.entries(categoryCounts)
    .map(([cat, n]) => `${cat}: ${n}`)
    .join(", ");
  console.log(`Dataset: ${testSet.length} queries (${breakdown})`);

  // Choose from the models currently loaded in Ollama's memory.
  // selectModel() throws if none are loaded. Picking a loaded model also
  // guarantees /api/generate accepts the exact name (no 404 tag mismatch).
  const selected = await selectModel();
  config.model = selected;
  console.log(`\nBenchmarking model: ${config.model}\n`);

  const results = await runBenchmark();

  // Optional human-in-the-loop pass: grade responses the auto-matcher rejected,
  // correcting false negatives before the report is generated.
  if (shouldReview()) {
    const review = await runManualReview(results);
    results.meta.manualReview = {
      reviewed: review.reviewed,
      markedCorrect: review.markedCorrect,
      markedWrong: review.markedWrong,
      skipped: review.skipped,
    };
    await offerSavePhrasings(review.acceptedPhrasings, testSet);
  }

  // Console summary (reflects any manual grades applied above).
  printConsoleReport(results);

  // Persist results: timestamped JSON + Markdown, prefixed with the model name.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Model names contain filesystem-unsafe characters (":" in "llama3.1:8b",
  // "/" in namespaced models). Replace any non-safe char with "-".
  const modelSlug = config.model.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const outDir = join(process.cwd(), config.outputDir);
  await mkdir(outDir, { recursive: true });

  const jsonPath = join(outDir, `${modelSlug}-results-${stamp}.json`);
  const mdPath = join(outDir, `${modelSlug}-report-${stamp}.md`);

  await writeFile(jsonPath, JSON.stringify(results, null, 2), "utf8");
  await writeFile(mdPath, buildMarkdownReport(results), "utf8");

  console.log(`Saved raw results:  ${jsonPath}`);
  console.log(`Saved report:       ${mdPath}`);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
