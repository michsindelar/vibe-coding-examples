// Interactive model selection from the models currently loaded in Ollama's
// memory (via /api/ps). Behavior:
//
//   - 0 loaded models  -> throw a clear error (the assignment requires this).
//   - OLLAMA_MODEL set  -> use it if it is loaded; otherwise error with the
//                          list of what IS loaded.
//   - exactly 1 loaded  -> auto-select it (no prompt needed).
//   - multiple loaded   -> interactive numbered menu on a TTY; on a non-TTY
//                          (piped/CI) default to the first and say so.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { config } from "./config.js";
import { listLoadedModels } from "./ollamaClient.js";

/** Human-readable size, e.g. 5.1 GB. */
function formatSize(bytes) {
  if (!bytes) return "unknown size";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function describe(m) {
  return `${m.name}  (${formatSize(m.sizeVramBytes)} in memory)`;
}

/**
 * Resolve which model to benchmark.
 * @returns {Promise<string>} the exact model name to use with /api/generate
 */
export async function selectModel() {
  const loaded = await listLoadedModels();

  // Requirement: if nothing is loaded into memory, error out.
  if (loaded.length === 0) {
    throw new Error(
      "No models are currently loaded in Ollama's memory.\n" +
        "Load one first, for example:\n" +
        "  ollama run llama3.1:8b\n" +
        "Then verify with `ollama ps` and re-run this benchmark.",
    );
  }

  const loadedNames = loaded.map((m) => m.name);

  // 1) Explicit override via env var: honor it only if actually loaded.
  const override = process.env.OLLAMA_MODEL;
  if (override) {
    if (loadedNames.includes(override)) {
      console.log(`Using model from OLLAMA_MODEL: ${override}`);
      return override;
    }
    throw new Error(
      `OLLAMA_MODEL="${override}" is set, but that model is not loaded in ` +
        `memory.\nCurrently loaded: ${loadedNames.join(", ")}\n` +
        `Either \`ollama run ${override}\` first, or pick one of the above.`,
    );
  }

  // 2) Exactly one loaded model: nothing to choose.
  if (loaded.length === 1) {
    console.log(`One model loaded in memory: ${describe(loaded[0])}`);
    return loaded[0].name;
  }

  // 3) Multiple models. On a non-interactive stdin we cannot prompt safely.
  if (!stdin.isTTY) {
    const fallback = loaded[0].name;
    console.log(
      `Multiple models loaded but input is non-interactive. ` +
        `Defaulting to "${fallback}". ` +
        `Set OLLAMA_MODEL to choose explicitly.`,
    );
    return fallback;
  }

  // 4) Interactive numbered menu.
  console.log("\nModels currently loaded in Ollama memory:");
  loaded.forEach((m, idx) => {
    console.log(`  ${idx + 1}) ${describe(m)}`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (
        await rl.question(`Select a model to benchmark [1-${loaded.length}]: `)
      ).trim();

      // Allow selecting by number or by exact name.
      const byName = loadedNames.find((n) => n === answer);
      if (byName) return byName;

      const num = Number(answer);
      if (Number.isInteger(num) && num >= 1 && num <= loaded.length) {
        return loaded[num - 1].name;
      }

      console.log(
        `Invalid choice "${answer}". Enter a number 1-${loaded.length} ` +
          `or an exact model name.`,
      );
    }
  } finally {
    rl.close();
  }
}
