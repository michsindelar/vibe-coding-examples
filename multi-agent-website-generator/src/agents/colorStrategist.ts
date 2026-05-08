import type { BrandPalette } from "./types.ts";
import { keepOnly, writeTextFile } from "../utils/fs.ts";
import { parseJsonObject } from "../utils/json.ts";
import { getOpenAIClient } from "../utils/openai.ts";

const PALETTE_OUTPUT_DIR = "dist/brand";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paletteFilePath(id: number): string {
  return `${PALETTE_OUTPUT_DIR}/palette_${id}.svg`;
}

function renderPaletteSvg(palette: BrandPalette): string {
  const [primary, accent, ink] = palette.colors;
  const label = escapeXml(palette.label);
  const colors = palette.colors.map(escapeXml);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 260" role="img" aria-labelledby="title desc">
  <title id="title">${label} brand palette</title>
  <desc id="desc">Three brand colors shown side by side: primary ${colors[0]}, accent ${colors[1]}, and ink ${colors[2]}.</desc>
  <rect width="720" height="260" fill="#FFFFFF"/>
  <text x="32" y="42" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700">${label}</text>
  <g transform="translate(32 72)">
    <rect x="0" y="0" width="208" height="124" fill="${primary}"/>
    <rect x="208" y="0" width="208" height="124" fill="${accent}"/>
    <rect x="416" y="0" width="208" height="124" fill="${ink}"/>
    <text x="24" y="162" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700">Primary</text>
    <text x="24" y="188" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="15">${colors[0]}</text>
    <text x="232" y="162" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700">Accent</text>
    <text x="232" y="188" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="15">${colors[1]}</text>
    <text x="440" y="162" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700">Ink</text>
    <text x="440" y="188" fill="${ink}" font-family="Inter, Arial, sans-serif" font-size="15">${colors[2]}</text>
  </g>
</svg>
`;
}

function sanitizePalette(
  value: { label?: string; colors?: unknown; rationale?: string },
  id: number,
): BrandPalette | null {
  if (!Array.isArray(value.colors) || value.colors.length !== 3) return null;

  const colors = value.colors.map((color) => (typeof color === "string" ? color.trim().toUpperCase() : ""));
  if (!colors.every((color) => /^#[0-9A-F]{6}$/.test(color))) return null;

  return {
    id,
    label: value.label?.trim().slice(0, 60) || `AI palette ${id}`,
    colors: colors as [string, string, string],
    rationale: value.rationale?.trim().slice(0, 220) || "AI-selected brand palette.",
    filePath: paletteFilePath(id),
  };
}

export async function writePaletteOptionSvgs(palettes: BrandPalette[]): Promise<BrandPalette[]> {
  const palettesWithPaths = palettes.map((palette) => ({
    ...palette,
    filePath: palette.filePath || paletteFilePath(palette.id),
  }));
  await Promise.all(
    palettesWithPaths.map((palette) => writeTextFile(palette.filePath, renderPaletteSvg(palette))),
  );
  return palettesWithPaths;
}

export async function cleanupRejectedPalettes(
  palettes: BrandPalette[],
  selectedPalette: BrandPalette,
): Promise<void> {
  const selectedPath = selectedPalette.filePath || paletteFilePath(selectedPalette.id);
  await keepOnly(
    palettes.map((palette) => palette.filePath || paletteFilePath(palette.id)),
    selectedPath,
  );
}

export async function generateBrandPaletteOptions(
  name: string,
  description: string,
): Promise<BrandPalette[]> {
  const client = await getOpenAIClient();
  if (!client?.responses) {
    throw new Error(
      "Palette selection requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns exactly 3 valid palette options.",
    );
  }

  try {
    const response = await client.responses.create({
      model: process.env.SITEGEN_PALETTE_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      instructions:
        "You are a senior brand color strategist. Return only valid JSON. Do not use Markdown.",
      input: `Create exactly 3 distinct 3-color brand palette options for this brand identity and website system.

Brand name: ${name}
Business description: ${description}

Return JSON with shape:
{"palettes":[{"label":"short option name","colors":["#RRGGBB","#RRGGBB","#RRGGBB"],"rationale":"short reason"}]}

Rules:
- Return exactly 3 palette options.
- Each palette must contain exactly 3 colors.
- Color 1 is the primary brand color.
- Color 2 is the accent color.
- Color 3 is the main text/ink color.
- Use 6-digit hex colors only.
- Make the 3 palette options meaningfully different from one another.
- Choose colors based on the brand concept and business description, not from a fixed preset.`,
    });

    if (!response.output_text) {
      throw new Error("OpenAI response did not include palette output.");
    }

    const parsed = parseJsonObject(response.output_text) as {
      palettes?: Array<{ label?: string; colors?: unknown; rationale?: string }>;
    };
    const palettes = (parsed.palettes || [])
      .slice(0, 3)
      .map((palette, index) => sanitizePalette(palette, index + 1))
      .filter((palette): palette is BrandPalette => Boolean(palette));

    if (palettes.length !== 3) {
      throw new Error("OpenAI response did not contain exactly 3 valid palette options.");
    }

    return writePaletteOptionSvgs(palettes);
  } catch (error) {
    console.warn(`OpenAI palette generation failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    throw new Error(
      "Palette selection requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns exactly 3 valid palette options.",
    );
  }
}
