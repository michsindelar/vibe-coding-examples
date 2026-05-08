import { join } from "node:path";
import type { LogoDraft, LogoOption } from "./types.ts";
import { parseJsonObject } from "../utils/json.ts";
import { getOpenAIClient } from "../utils/openai.ts";
import { sanitizeSvg } from "../utils/svg.ts";
import { writeTextFile, keepOnly } from "../utils/fs.ts";

function normalizeHex(color: string): string {
  return color.trim().toUpperCase();
}

function usesOnlyPaletteColors(svg: string, colors: [string, string]): boolean {
  const allowed = new Set(colors.map(normalizeHex));
  const hexColors = svg.match(/#[0-9a-f]{6}\b/gi) || [];
  if (hexColors.some((color) => !allowed.has(normalizeHex(color)))) return false;
  if (/#[0-9a-f]{3}\b|#[0-9a-f]{8}\b|rgb\(|rgba\(|hsl\(|hsla\(/i.test(svg)) return false;

  const colorAttributePattern = /\b(?:fill|stroke|stop-color|color)\s*=\s*["']([^"']+)["']/gi;
  for (const match of svg.matchAll(colorAttributePattern)) {
    const value = match[1].trim();
    if (/^(none|transparent)$/i.test(value) || /^url\(#[-\w]+\)$/i.test(value)) continue;
    if (!allowed.has(normalizeHex(value))) return false;
  }

  const styleColorPattern = /\b(?:fill|stroke|stop-color|color)\s*:\s*([^;}"']+)/gi;
  for (const match of svg.matchAll(styleColorPattern)) {
    const value = match[1].trim();
    if (/^(none|transparent)$/i.test(value) || /^url\(#[-\w]+\)$/i.test(value)) continue;
    if (!allowed.has(normalizeHex(value))) return false;
  }

  return true;
}

async function generateLogoDrafts(name: string, description: string, palette: [string, string, string]): Promise<LogoDraft[] | null> {
  const client = await getOpenAIClient();
  if (!client?.responses) return null;
  const logoColors: [string, string] = [palette[0], palette[1]];

  try {
    const response = await client.responses.create({
      model: process.env.SITEGEN_LOGO_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      instructions:
        "You are a senior logo designer. Return only valid JSON. Do not use Markdown. Create original SVG logo marks, not raster image links.",
      input: `Create exactly 3 distinct SVG logo concepts for this brand.

Brand name: ${name}
Business description: ${description}
Selected palette:
- Primary: ${logoColors[0]}
- Secondary/accent: ${logoColors[1]}
- Ink, reserved for website text only: ${palette[2]}

Requirements:
- Return JSON with shape {"logos":[{"label":"short concept name","svg":"<svg ...>...</svg>"}]}.
- Each SVG must be a complete standalone vector file with transparent background.
- Use viewBox="0 0 320 320".
- Use simple geometric vector shapes and optional initials only.
- Do not include scripts, external resources, embedded images, foreignObject, or event handlers.
- Make each concept visually distinct in composition.
- Use a maximum of 2 colors in each logo.
- Logo colors must come only from the selected primary and secondary colors.
- Do not use the ink color, black, white, gray, named colors, rgb(), hsl(), or additional hex colors.`,
    });

    if (!response.output_text) return null;

    const parsed = parseJsonObject(response.output_text) as { logos?: Array<{ label?: string; svg?: string }> };
    const drafts = (parsed.logos || [])
      .slice(0, 3)
      .map((logo, index) => ({
        label: logo.label?.trim() || `OpenAI logo concept ${index + 1}`,
        svg: sanitizeSvg(logo.svg || ""),
      }))
      .filter((logo): logo is LogoDraft => Boolean(logo.svg && usesOnlyPaletteColors(logo.svg, logoColors)));

    return drafts.length === 3 ? drafts : null;
  } catch (error) {
    console.warn(`OpenAI logo generation failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    return null;
  }
}

export async function generateLogoOptions(name: string, description: string, palette: [string, string, string]): Promise<LogoOption[]> {
  const aiDrafts = await generateLogoDrafts(name, description, palette);
  if (!aiDrafts) {
    throw new Error(
      "Logo generation requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns exactly 3 valid SVG logo concepts using only the selected primary and secondary palette colors.",
    );
  }

  const options: LogoOption[] = [];
  for (const [index, draft] of aiDrafts.entries()) {
    const id = index + 1;
    const filePath = join("dist", "brand", `logo_${id}.svg`);
    await writeTextFile(filePath, draft.svg);
    options.push({ id, label: `${draft.label} (OpenAI)`, filePath, source: "openai" });
  }
  return options;
}

export async function cleanupRejectedLogos(options: LogoOption[], selected: LogoOption): Promise<void> {
  await keepOnly(
    options.map((option) => option.filePath),
    selected.filePath,
  );
}
