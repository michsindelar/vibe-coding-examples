export function svgDocument(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
${body}
</svg>
`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeSvg(svg: string): string | null {
  const match = svg.trim().match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return null;

  const candidate = match[0]
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .trim();

  if (/<script|<foreignObject|<image|\son\w+=|href=/i.test(candidate)) return null;
  if (!/<svg[^>]*viewBox=["']0 0 320 320["']/i.test(candidate)) return null;

  return candidate.includes("xmlns=") ? `${candidate}\n` : candidate.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"') + "\n";
}
