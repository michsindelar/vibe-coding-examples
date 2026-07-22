// Central configuration for the benchmark run.
// Override any value with environment variables, e.g.:
//   OLLAMA_MODEL=qwen2.5 OLLAMA_REPETITIONS=5 npm start

export const config = {
  // Ollama HTTP API endpoint (default local install).
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",

  // Model to benchmark. Normally chosen at runtime from the models loaded in
  // Ollama's memory (see selectModel.js). Setting OLLAMA_MODEL pre-selects a
  // loaded model and skips the interactive menu. The empty default just means
  // "no pre-selection".
  model: process.env.OLLAMA_MODEL ?? "",

  // How many times each (query x technique) combination is run.
  // More repetitions => better consistency measurement, but slower.
  repetitions: Number(process.env.OLLAMA_REPETITIONS ?? 3),

  // Sampling options sent to Ollama. Low temperature keeps runs comparable.
  options: {
    temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.2),
    // Context window. Few-shot prompts get long; raise if you have VRAM,
    // lower if you hit out-of-memory on an 8 GB card.
    num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
  },

  // Per-request timeout in milliseconds.
  requestTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),

  // Which techniques to benchmark. Comment any out to skip them.
  techniques: ["baseline", "rephrase", "oneShot", "fewShot", "chainOfThought"],

  // Output directory for JSON + Markdown reports (relative to benchmark/).
  outputDir: process.env.OLLAMA_OUTPUT_DIR ?? "results",

  // Manual review: after the run, prompt the user to grade responses the
  // automatic matcher did NOT accept (catches correct-but-unphrased answers).
  //   "auto"  -> enabled when stdin is a TTY, skipped when piped/CI (default)
  //   "on"    -> always attempt review (errors if no TTY)
  //   "off"   -> never review; non-matches stay scored as 0
  manualReview: process.env.MANUAL_REVIEW ?? "auto",
};
