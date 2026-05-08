import { join } from "node:path";
import type { BrandProfile, DesignBrief, WebsiteUxPlan } from "./types.ts";
import { writeTextFile } from "../utils/fs.ts";

const DESIGN_DIR = join("dist", "design");
const DESIGN_BRIEF_PATH = join(DESIGN_DIR, "design-brief.json");

function inferSections(description: string, uxPlan: WebsiteUxPlan): string[] {
  const lower = description.toLowerCase();
  const sections = [
    "Home: hero, introduction, partnership logos, and testimonials",
    "About: mission, vision, team profiles, and company history",
    uxPlan.projectsContact.hasProjectPortfolio
      ? "Project Portfolio: portfolio grid with a contact call to action"
      : "Contact: contact details and static contact form",
  ];

  if (uxPlan.projectsContact.hasProjectPortfolio && /shop|commerce|product|retail/.test(lower)) {
    sections.push("Commerce-focused project examples");
  }
  if (/service|consult|agency|studio/.test(lower)) sections.push("Service delivery and client partnership messaging");
  if (/book|schedule|appointment|reservation/.test(lower)) sections.push("Contact page booking call to action");
  if (/saas|software|platform|tool/.test(lower)) sections.push("Platform capability portfolio examples");

  return sections;
}

export async function createDesignBrief(brand: BrandProfile, uxPlan: WebsiteUxPlan): Promise<DesignBrief> {
  const brief: DesignBrief = {
    brand,
    uxPlan,
    sections: inferSections(brand.description, uxPlan),
    layoutNotes: [
      "Use the finalized logo lockup as the primary header brand asset.",
      `Follow this AI-generated UX strategy: ${uxPlan.uxStrategy}`,
      uxPlan.projectsContact.hasProjectPortfolio
        ? "Design a professional corporate static website with Home, About, Project Portfolio, and Contact pages."
        : "Design a professional corporate static website with Home, About, and Contact pages.",
      "Keep each page hero first, then follow the AI-selected sectionOrder exactly for the remaining page sections.",
      "Use persistent navigation and a shared footer across all pages.",
      uxPlan.projectsContact.hasProjectPortfolio
        ? "Include professional placeholder assets for partner logos, team profiles, portfolio work, and icons."
        : "Include professional placeholder assets for partner logos, team profiles, and icons.",
      "Apply the generated palette as primary, secondary/accent, and ink colors with neutral backgrounds.",
      "Use semantic HTML sections and BEM-oriented component naming in the implementation.",
      "Support responsive desktop, tablet, and mobile layouts with a hamburger navigation menu.",
      "Include unique page titles and meta descriptions for every generated HTML page.",
    ],
    generatedAt: new Date().toISOString(),
  };

  await writeTextFile(DESIGN_BRIEF_PATH, `${JSON.stringify(brief, null, 2)}\n`);
  return brief;
}
