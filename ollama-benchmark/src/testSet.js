// Loads the test set by merging every *.json file in the data/ directory.
//
// Each category has its own file (e.g. data/math.json, data/factual.json,
// data/reasoning.json). Dropping a new <category>.json file into data/ adds it
// to the benchmark automatically - no code change required.
//
// Each entry has:
//   id            - stable identifier (unique across ALL files)
//   category      - grouping used in the analysis (factual, math, reasoning, ...)
//   query         - the raw user question (used as-is for the baseline)
//   expected      - canonical answer used to score accuracy
//   acceptable    - extra strings that also count as correct (optional)
//   rephrased     - a clearer restatement of the query (rephrase technique)
//
// Keeping expected answers short and unambiguous makes automatic scoring far
// more reliable. Set TESTSET_LIMIT to cap items per category for quick runs,
// e.g. TESTSET_LIMIT=5 npm start

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

/** Absolute path to the dataset directory (used by manual-review save-back). */
export const DATA_DIR = dataDir;

// Optional cap on items per category file (useful for fast smoke tests).
const perCategoryLimit = Number(process.env.TESTSET_LIMIT ?? 0);

const REQUIRED_FIELDS = ["id", "category", "query", "expected"];

async function loadCategoryFile(fileName) {
  const filePath = join(dataDir, fileName);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to read/parse ${fileName}: ${err.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${fileName} is empty or not a JSON array.`);
  }

  for (const item of parsed) {
    for (const field of REQUIRED_FIELDS) {
      if (typeof item[field] !== "string" || item[field].length === 0) {
        throw new Error(
          `Entry ${JSON.stringify(item.id ?? "?")} in ${fileName} is missing ` +
            `required string field "${field}".`,
        );
      }
    }
  }

  return perCategoryLimit > 0 ? parsed.slice(0, perCategoryLimit) : parsed;
}

async function loadTestSet() {
  const allFiles = await readdir(dataDir);
  const jsonFiles = allFiles
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort(); // deterministic order

  if (jsonFiles.length === 0) {
    throw new Error(`No .json dataset files found in ${dataDir}.`);
  }

  const merged = [];
  const seenIds = new Set();

  for (const file of jsonFiles) {
    const entries = await loadCategoryFile(file);
    for (const entry of entries) {
      if (seenIds.has(entry.id)) {
        throw new Error(
          `Duplicate id "${entry.id}" found (in ${file}). ` +
            `Ids must be unique across all dataset files.`,
        );
      }
      seenIds.add(entry.id);
      merged.push(entry);
    }
  }

  return merged;
}

/** @type {Array<{id:string,category:string,query:string,expected:string,acceptable?:string[],rephrased?:string}>} */
export const testSet = await loadTestSet();

/** Counts per category, useful for logging/sanity checks. */
export const categoryCounts = testSet.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] ?? 0) + 1;
  return acc;
}, {});
