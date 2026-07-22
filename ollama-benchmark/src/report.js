// Turns raw benchmark results into:
//   1) a per-technique summary table (accuracy, consistency, relevance)
//   2) a per-category breakdown (which technique helps which query type)
//   3) a Markdown report file you can drop straight into your homework
//   4) the full raw JSON for appendices / re-analysis

import { mean } from "./scoring.js";
import { techniqueLabels } from "./techniques.js";

/** Compute per-technique aggregates from the cell-level results. */
export function summarize(results) {
  const byTechnique = new Map();

  for (const cell of results.cells) {
    if (!byTechnique.has(cell.technique)) byTechnique.set(cell.technique, []);
    byTechnique.get(cell.technique).push(cell);
  }

  const summary = [];
  for (const [technique, cells] of byTechnique) {
    summary.push({
      technique,
      label: techniqueLabels[technique] ?? technique,
      accuracy: mean(cells.map((c) => c.accuracy)),
      consistency: mean(cells.map((c) => c.consistency)),
      relevance: mean(cells.map((c) => c.relevance)),
    });
  }
  // Sort by accuracy descending for easy reading.
  summary.sort((a, b) => b.accuracy - a.accuracy);
  return summary;
}

/** Per-category accuracy, broken down by technique. */
export function summarizeByCategory(results) {
  const categories = [...new Set(results.cells.map((c) => c.category))].sort();
  const techniques = results.meta.techniques;

  const table = {};
  for (const cat of categories) {
    table[cat] = {};
    for (const tech of techniques) {
      const cells = results.cells.filter(
        (c) => c.category === cat && c.technique === tech,
      );
      table[cat][tech] = cells.length ? mean(cells.map((c) => c.accuracy)) : null;
    }
  }
  return { categories, techniques, table };
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

/** Print a readable summary to the console. */
export function printConsoleReport(results) {
  const summary = summarize(results);

  console.log("\n" + "=".repeat(64));
  console.log(`BENCHMARK SUMMARY  -  model: ${results.meta.model}`);
  console.log(
    `queries: ${results.meta.queryCount}  |  repetitions: ${results.meta.repetitions}  |  temp: ${results.meta.options.temperature}`,
  );
  console.log("=".repeat(64));

  // Column widths
  const rows = summary.map((s) => [
    s.label,
    pct(s.accuracy),
    pct(s.consistency),
    pct(s.relevance),
  ]);
  const headers = ["Technique", "Accuracy", "Consistency", "Relevance"];
  printTable(headers, rows);

  // Highlight best/worst vs baseline.
  const baseline = summary.find((s) => s.technique === "baseline");
  if (baseline) {
    console.log(`\nBaseline accuracy: ${pct(baseline.accuracy)}`);
    for (const s of summary) {
      if (s.technique === "baseline") continue;
      const delta = s.accuracy - baseline.accuracy;
      const sign = delta >= 0 ? "+" : "";
      console.log(`  ${s.label.padEnd(24)} ${sign}${(delta * 100).toFixed(1)} pts`);
    }
  }
  console.log("");
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );
  const line = (cells) =>
    "| " + cells.map((c, i) => String(c).padEnd(widths[i])).join(" | ") + " |";
  console.log("\n" + line(headers));
  console.log(
    "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|",
  );
  for (const r of rows) console.log(line(r));
}

/** Build a Markdown report string suitable for submission. */
export function buildMarkdownReport(results) {
  const summary = summarize(results);
  const cat = summarizeByCategory(results);
  const m = results.meta;

  const lines = [];
  lines.push(`# Prompt Engineering Benchmark Report`);
  lines.push("");
  lines.push(`- **Model:** \`${m.model}\``);
  lines.push(`- **Queries:** ${m.queryCount}`);
  lines.push(`- **Repetitions per query:** ${m.repetitions}`);
  lines.push(`- **Temperature:** ${m.options.temperature}`);
  lines.push(`- **Context window:** ${m.options.num_ctx}`);
  lines.push(`- **Run:** ${m.startedAt} -> ${m.finishedAt}`);
  lines.push("");

  lines.push(`## 1. Overall results by technique`);
  lines.push("");
  lines.push(`| Technique | Accuracy | Consistency | Relevance |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const s of summary) {
    lines.push(
      `| ${s.label} | ${pct(s.accuracy)} | ${pct(s.consistency)} | ${pct(s.relevance)} |`,
    );
  }
  lines.push("");

  // Deltas vs baseline
  const baseline = summary.find((s) => s.technique === "baseline");
  if (baseline) {
    lines.push(`### Accuracy change vs. baseline`);
    lines.push("");
    lines.push(`| Technique | Δ Accuracy (pts) |`);
    lines.push(`| --- | --- |`);
    for (const s of summary) {
      if (s.technique === "baseline") continue;
      const delta = (s.accuracy - baseline.accuracy) * 100;
      lines.push(`| ${s.label} | ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} |`);
    }
    lines.push("");
  }

  lines.push(`## 2. Accuracy by query category`);
  lines.push("");
  lines.push(
    `| Category | ${cat.techniques.map((t) => techniqueLabels[t] ?? t).join(" | ")} |`,
  );
  lines.push(`| --- | ${cat.techniques.map(() => "---").join(" | ")} |`);
  for (const c of cat.categories) {
    const cells = cat.techniques.map((t) =>
      cat.table[c][t] == null ? "-" : pct(cat.table[c][t]),
    );
    lines.push(`| ${c} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push(`## 3. Analysis notes`);
  lines.push("");
  lines.push(generateAnalysis(summary, cat));
  lines.push("");

  lines.push(`## 4. Per-query detail`);
  lines.push("");
  for (const cell of results.cells) {
    lines.push(
      `- \`${cell.queryId}\` (${cell.category}) **${cell.technique}** — ` +
        `accuracy ${pct(cell.accuracy)}, consistency ${pct(cell.consistency)}, ` +
        `relevance ${pct(cell.relevance)}`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

/** Produce a short auto-generated analysis paragraph from the numbers. */
function generateAnalysis(summary, cat) {
  const baseline = summary.find((s) => s.technique === "baseline");
  const best = summary[0];
  const notes = [];

  if (best && baseline && best.technique !== "baseline") {
    const delta = ((best.accuracy - baseline.accuracy) * 100).toFixed(1);
    notes.push(
      `- **${best.label}** achieved the highest accuracy (${pct(best.accuracy)}), ` +
        `a change of ${delta} points versus the baseline (${pct(baseline.accuracy)}).`,
    );
  } else if (best) {
    notes.push(
      `- The **baseline** matched or beat all engineered prompts on accuracy ` +
        `(${pct(best.accuracy)}); for this query mix the extra prompting added little.`,
    );
  }

  // Most consistent technique.
  const mostConsistent = [...summary].sort(
    (a, b) => b.consistency - a.consistency,
  )[0];
  if (mostConsistent) {
    notes.push(
      `- **${mostConsistent.label}** was the most consistent across repeated ` +
        `runs (${pct(mostConsistent.consistency)}).`,
    );
  }

  // Category-specific call-out: where does CoT help most?
  if (cat.techniques.includes("chainOfThought")) {
    for (const c of cat.categories) {
      const base = cat.table[c]["baseline"];
      const cot = cat.table[c]["chainOfThought"];
      if (base != null && cot != null && cot - base >= 0.2) {
        notes.push(
          `- Chain of Thought gave a notable boost on **${c}** queries ` +
            `(${pct(base)} -> ${pct(cot)}), consistent with its strength on ` +
            `multi-step reasoning.`,
        );
      }
    }
  }

  notes.push(
    `- Remember to spot-check a sample of raw responses by hand: the scores ` +
      `here are automatic heuristics and may miss nuance.`,
  );

  return notes.join("\n");
}
