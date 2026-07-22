// Minimal Ollama API client using Node's native fetch (Node 18+).
// Talks to the /api/generate, /api/tags, and /api/ps endpoints. No deps.

import { config } from "./config.js";

/**
 * List models currently loaded into Ollama's memory (VRAM/RAM).
 * This is what `ollama ps` shows, via the /api/ps endpoint - NOT the same as
 * /api/tags, which lists every installed model whether loaded or not.
 *
 * @returns {Promise<Array<{name:string, sizeVramBytes:number, expiresAt:string|null}>>}
 */
export async function listLoadedModels() {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/ps`);
  } catch (err) {
    throw new Error(
      `Cannot reach Ollama at ${config.ollamaUrl}. ` +
        "Is it running? Start it with `ollama serve`. " +
        `(${err.message})`,
    );
  }

  if (!res.ok) {
    throw new Error(`Ollama /api/ps returned HTTP ${res.status}.`);
  }

  const data = await res.json();
  return (data.models ?? []).map((m) => ({
    name: m.name,
    sizeVramBytes: m.size_vram ?? m.size ?? 0,
    expiresAt: m.expires_at ?? null,
  }));
}

/**
 * Send a single prompt to the model and return the full text response.
 * Uses stream:false so we get one JSON object back.
 *
 * @param {string} prompt
 * @returns {Promise<{response: string, totalDurationMs: number}>}
 */
export async function generate(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt,
        stream: false,
        options: config.options,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // A 404 here almost always means the model tag is wrong (Ollama needs
      // the exact installed name, e.g. "llama3.1:8b" not "llama3.1").
      if (res.status === 404) {
        throw new Error(
          `Ollama could not find model "${config.model}" (HTTP 404). ` +
            `Check the exact name with \`ollama list\` and set OLLAMA_MODEL ` +
            `to match. Server said: ${body}`,
        );
      }
      throw new Error(
        `Ollama returned HTTP ${res.status} ${res.statusText}. ${body}`,
      );
    }

    const data = await res.json();
    return {
      response: (data.response ?? "").trim(),
      // total_duration is in nanoseconds; convert to ms for readability.
      totalDurationMs: data.total_duration
        ? Math.round(data.total_duration / 1e6)
        : null,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${config.requestTimeoutMs} ms. ` +
          "The model may be too large for your VRAM (check `ollama ps`).",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * List every installed model (loaded or not), via /api/tags.
 * Kept as a helper for diagnostics; the benchmark itself selects from the
 * models currently loaded in memory (see listLoadedModels + selectModel).
 *
 * @returns {Promise<string[]>} installed model names
 */
export async function listInstalledModels() {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/tags`);
  } catch (err) {
    throw new Error(
      `Cannot reach Ollama at ${config.ollamaUrl}. ` +
        "Is it running? Start it with `ollama serve`. " +
        `(${err.message})`,
    );
  }

  if (!res.ok) {
    throw new Error(`Ollama /api/tags returned HTTP ${res.status}.`);
  }

  const data = await res.json();
  return (data.models ?? []).map((m) => m.name);
}
