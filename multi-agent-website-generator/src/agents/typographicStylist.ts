import { join } from "node:path";
import type { LogoOption, TypographySuggestion } from "./types.ts";
import { parseJsonObject } from "../utils/json.ts";
import { getOpenAIClient } from "../utils/openai.ts";
import { keepOnly, writeTextFile } from "../utils/fs.ts";
import { escapeXml, svgDocument } from "../utils/svg.ts";

const fontStacks = new Set([
  "Inter, Arial, sans-serif",
  "Avenir, Arial, sans-serif",
  "Georgia, serif",
  "Helvetica Neue, Arial, sans-serif",
  "Trebuchet MS, Arial, sans-serif",
  "Verdana, Geneva, sans-serif",
]);

const layouts = new Set(["horizontal", "stacked", "compact"]);

function sanitizeTypographySuggestion(value: {
  label?: string;
  font?: string;
  weight?: number;
  color?: string;
  layout?: string;
  rationale?: string;
}, colors: [string, string]): TypographySuggestion | null {
  const font = value.font?.trim();
  const weight = Number(value.weight);
  const color = value.color?.trim().toUpperCase();
  const layout = value.layout?.trim();
  const allowedColors = new Set(colors.map((paletteColor) => paletteColor.toUpperCase()));

  if (!font || !fontStacks.has(font)) return null;
  if (!Number.isInteger(weight) || weight < 400 || weight > 900) return null;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  if (!allowedColors.has(color)) return null;
  if (!layout || !layouts.has(layout)) return null;

  return {
    label: value.label?.trim().slice(0, 60) || "OpenAI typography suggestion",
    font,
    weight,
    color,
    layout: layout as TypographySuggestion["layout"],
    rationale: value.rationale?.trim().slice(0, 180) || "Generated typography direction.",
  };
}

async function generateTypographySuggestions(
  name: string,
  description: string,
  palette: [string, string, string],
): Promise<TypographySuggestion[] | null> {
  const client = await getOpenAIClient();
  if (!client?.responses) return null;
  const typographyColors: [string, string] = [palette[0], palette[1]];

  try {
    const response = await client.responses.create({
      model: process.env.SITEGEN_TYPOGRAPHY_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      instructions:
        "You are a senior brand typography specialist. Return only valid JSON. Do not use Markdown.",
      input: `Suggest exactly 3 typography-only visual style treatments for the brand name.

Brand title: ${name}
Business description: ${description}
Selected palette:
- Primary: ${typographyColors[0]}
- Secondary/accent: ${typographyColors[1]}
- Ink, reserved for website text only: ${palette[2]}

Return JSON with shape:
{"suggestions":[{"label":"short name","font":"font stack","weight":800,"color":"#101828","layout":"horizontal","rationale":"short reason"}]}

Allowed font values:
- Inter, Arial, sans-serif
- Avenir, Arial, sans-serif
- Georgia, serif
- Helvetica Neue, Arial, sans-serif
- Trebuchet MS, Arial, sans-serif
- Verdana, Geneva, sans-serif

Rules:
- Use one of these layout values: horizontal, stacked, compact.
- Use a 6-digit hex color from the selected primary or secondary color only.
- Do not use the ink color, black, white, gray, named colors, rgb(), hsl(), or additional hex colors.
- Use font weights from 400 through 900.
- Do not include or reference a logo mark. These are standalone wordmark style proposals.
- Make the 3 suggestions meaningfully different in tone and layout.`,
    });

    if (!response.output_text) return null;

    const parsed = parseJsonObject(response.output_text) as {
      suggestions?: Array<{
        label?: string;
        font?: string;
        weight?: number;
        color?: string;
        layout?: string;
        rationale?: string;
      }>;
    };
    const suggestions = (parsed.suggestions || [])
      .slice(0, 3)
      .map((suggestion) => sanitizeTypographySuggestion(suggestion, typographyColors))
      .filter((suggestion): suggestion is TypographySuggestion => Boolean(suggestion));

    return suggestions.length === 3 ? suggestions : null;
  } catch (error) {
    console.warn(`OpenAI typography generation failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    return null;
  }
}

function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name, ""];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function renderLockup(name: string, style: TypographySuggestion): string {
  if (style.layout === "stacked") {
    const [firstLine, secondLine] = splitName(name);
    return secondLine
      ? `<text x="320" y="142" text-anchor="middle" font-family="${style.font}" font-size="64" font-weight="${style.weight}" fill="${style.color}">${escapeXml(firstLine)}</text>
<text x="320" y="214" text-anchor="middle" font-family="${style.font}" font-size="64" font-weight="${style.weight}" fill="${style.color}">${escapeXml(secondLine)}</text>`
      : `<text x="320" y="180" text-anchor="middle" font-family="${style.font}" font-size="64" font-weight="${style.weight}" fill="${style.color}">${escapeXml(firstLine)}</text>`;
  }

  if (style.layout === "compact") {
    return `<text x="320" y="178" text-anchor="middle" font-family="${style.font}" font-size="58" font-weight="${style.weight}" fill="${style.color}">${escapeXml(name)}</text>`;
  }

  return `<text x="320" y="188" text-anchor="middle" font-family="${style.font}" font-size="64" font-weight="${style.weight}" fill="${style.color}">${escapeXml(name)}</text>`;
}

export async function generateNameLockups(
  name: string,
  _logoPath: string,
  description: string,
  palette: [string, string, string],
): Promise<LogoOption[]> {
  const suggestions = await generateTypographySuggestions(name, description, palette);
  if (!suggestions) {
    throw new Error(
      "Typography generation requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns exactly 3 valid typography suggestions using only the selected primary or secondary palette color.",
    );
  }
  const options: LogoOption[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const style = suggestions[index - 1];
    const filePath = join("dist", "brand", `name_${index}.svg`);
    const body = renderLockup(name, style);

    await writeTextFile(filePath, svgDocument(640, 320, body));
    options.push({
      id: index,
      label: `${style.label} - ${style.rationale}`,
      filePath,
      source: "openai",
    });
  }

  return options;
}

export async function cleanupRejectedLockups(options: LogoOption[], selected: LogoOption): Promise<void> {
  await keepOnly(
    options.map((option) => option.filePath),
    selected.filePath,
  );
}
