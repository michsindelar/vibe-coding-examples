export function parseJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("OpenAI response did not contain a JSON object.");
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}
