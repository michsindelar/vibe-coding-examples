import type { BrandName } from "./types.ts";
import { getOpenAIClient } from "../utils/openai.ts";

async function generateNamesWithOpenAI(description: string): Promise<BrandName[] | null> {
  const client = await getOpenAIClient();
  if (!client?.chat) return null;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strategic naming consultant. Return JSON with a names array of exactly 3 objects: name and rationale.",
      },
      {
        role: "user",
        content: `Create company names for this business concept:\n${description}`,
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { names?: BrandName[] };
    const names = (parsed.names || [])
      .slice(0, 3)
      .map((item) => ({
        name: item.name?.trim(),
        rationale: item.rationale?.trim(),
      }))
      .filter((item): item is BrandName => Boolean(item.name && item.rationale));

    return names.length === 3 ? names : null;
  } catch {
    return null;
  }
}

export async function generateBrandNames(description: string): Promise<BrandName[]> {
  const aiNames = await generateNamesWithOpenAI(description);
  if (aiNames?.length === 3) return aiNames;

  throw new Error(
    "Brand naming requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns exactly 3 valid company names.",
  );
}
