import type {
  AboutSectionKey,
  BrandProfile,
  ContactSectionKey,
  HomeSectionKey,
  ProjectSectionKey,
  ProjectCopy,
  TeamMemberCopy,
  TestimonialCopy,
  TextCard,
  TimelineItemCopy,
  WebsiteUxPlan,
} from "./types.ts";
import { parseJsonObject } from "../utils/json.ts";
import { getOpenAIClient } from "../utils/openai.ts";

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function textCard(value: unknown): TextCard | null {
  const item = value as { title?: unknown; text?: unknown };
  const title = text(item?.title, 80);
  const body = text(item?.text, 360);
  return title && body ? { title, text: body } : null;
}

function testimonial(value: unknown): TestimonialCopy | null {
  const item = value as { quote?: unknown; author?: unknown };
  const quote = text(item?.quote, 300);
  const author = text(item?.author, 80);
  return quote && author ? { quote, author } : null;
}

function teamMember(value: unknown): TeamMemberCopy | null {
  const item = value as { name?: unknown; role?: unknown; bio?: unknown };
  const name = text(item?.name, 80);
  const role = text(item?.role, 80);
  const bio = text(item?.bio, 320);
  return name && role && bio ? { name, role, bio } : null;
}

function timelineItem(value: unknown): TimelineItemCopy | null {
  const item = value as { year?: unknown; text?: unknown };
  const year = text(item?.year, 12);
  const body = text(item?.text, 320);
  return year && body ? { year, text: body } : null;
}

function project(value: unknown): ProjectCopy | null {
  const item = value as { title?: unknown; category?: unknown; text?: unknown };
  const title = text(item?.title, 80);
  const category = text(item?.category, 40);
  const body = text(item?.text, 360);
  return title && category && body ? { title, category, text: body } : null;
}

function tuple<T>(values: unknown, length: number, mapper: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(values) || values.length !== length) return null;
  const mapped = values.map(mapper);
  return mapped.every(Boolean) ? (mapped as T[]) : null;
}

function sectionOrder<T extends string>(values: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(values) || values.length !== allowed.length) return null;
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const order: T[] = [];

  for (const value of values) {
    if (typeof value !== "string" || !allowedSet.has(value as T) || seen.has(value)) return null;
    seen.add(value);
    order.push(value as T);
  }

  return seen.size === allowed.length ? order : null;
}

function sanitizeUxPlan(value: unknown): WebsiteUxPlan | null {
  const input = value as {
    uxStrategy?: unknown;
    sectionOrder?: {
      home?: unknown;
      about?: unknown;
      projects?: unknown;
      contact?: unknown;
    };
    navigation?: { home?: unknown; about?: unknown; projects?: unknown; contact?: unknown };
    home?: Record<string, unknown>;
    about?: Record<string, unknown>;
    projectsContact?: Record<string, unknown>;
  };

  const introCards = tuple(input.home?.introCards, 3, textCard);
  const testimonials = tuple(input.home?.testimonials, 2, testimonial);
  const team = tuple(input.about?.team, 3, teamMember);
  const history = tuple(input.about?.history, 3, timelineItem);
  const hasProjectPortfolio =
    typeof input.projectsContact?.hasProjectPortfolio === "boolean" ? input.projectsContact.hasProjectPortfolio : null;
  const projects = hasProjectPortfolio ? tuple(input.projectsContact?.projects, 4, project) : undefined;
  const capabilities = hasProjectPortfolio === false ? tuple(input.projectsContact?.capabilities, 3, textCard) : undefined;
  const homeOrder = sectionOrder<HomeSectionKey>(input.sectionOrder?.home, ["intro", "partners", "testimonials"]);
  const aboutOrder = sectionOrder<AboutSectionKey>(input.sectionOrder?.about, ["missionVision", "team", "history"]);
  const projectOrder =
    hasProjectPortfolio === true
      ? sectionOrder<ProjectSectionKey>(input.sectionOrder?.projects, ["portfolio"])
      : sectionOrder<ProjectSectionKey>(input.sectionOrder?.projects, []);
  const contactOrder = sectionOrder<ContactSectionKey>(input.sectionOrder?.contact, ["contactDetails", "contactForm"]);

  const plan = {
    uxStrategy: text(input.uxStrategy, 360),
    sectionOrder: {
      home: homeOrder,
      about: aboutOrder,
      projects: projectOrder,
      contact: contactOrder,
    },
    navigation: {
      home: text(input.navigation?.home, 30),
      about: text(input.navigation?.about, 30),
      projects: text(input.navigation?.projects, 40),
      contact: text(input.navigation?.contact, 30) || "Contact",
    },
    home: {
      metaTitle: text(input.home?.metaTitle, 70),
      metaDescription: text(input.home?.metaDescription, 160),
      heroTitle: text(input.home?.heroTitle, 110),
      heroSummary: text(input.home?.heroSummary, 360),
      ctaLabel: text(input.home?.ctaLabel, 40),
      introTitle: text(input.home?.introTitle, 120),
      introCards,
      partnersTitle: text(input.home?.partnersTitle, 110),
      testimonialsTitle: text(input.home?.testimonialsTitle, 110),
      testimonials,
    },
    about: {
      metaTitle: text(input.about?.metaTitle, 70),
      metaDescription: text(input.about?.metaDescription, 160),
      heroTitle: text(input.about?.heroTitle, 110),
      heroSummary: text(input.about?.heroSummary, 360),
      mission: text(input.about?.mission, 420),
      vision: text(input.about?.vision, 420),
      team,
      history,
    },
    projectsContact: {
      metaTitle: text(input.projectsContact?.metaTitle, 70),
      metaDescription: text(input.projectsContact?.metaDescription, 160),
      heroTitle: text(input.projectsContact?.heroTitle, 110),
      heroSummary: text(input.projectsContact?.heroSummary, 360),
      hasProjectPortfolio,
      portfolioTitle: hasProjectPortfolio ? text(input.projectsContact?.portfolioTitle, 110) : undefined,
      projects,
      capabilitiesTitle:
        hasProjectPortfolio === false ? text(input.projectsContact?.capabilitiesTitle, 110) : undefined,
      capabilities,
      contactTitle: text(input.projectsContact?.contactTitle, 110),
      contactIntro: text(input.projectsContact?.contactIntro, 360),
    },
  };

  if (
    !plan.uxStrategy ||
    !plan.sectionOrder.home ||
    !plan.sectionOrder.about ||
    !plan.sectionOrder.projects ||
    !plan.sectionOrder.contact ||
    !plan.navigation.home ||
    !plan.navigation.about ||
    !plan.navigation.projects ||
    !plan.navigation.contact ||
    !plan.home.metaTitle ||
    !plan.home.metaDescription ||
    !plan.home.heroTitle ||
    !plan.home.heroSummary ||
    !plan.home.ctaLabel ||
    !plan.home.introTitle ||
    !plan.home.introCards ||
    !plan.home.partnersTitle ||
    !plan.home.testimonialsTitle ||
    !plan.home.testimonials ||
    !plan.about.metaTitle ||
    !plan.about.metaDescription ||
    !plan.about.heroTitle ||
    !plan.about.heroSummary ||
    !plan.about.mission ||
    !plan.about.vision ||
    !plan.about.team ||
    !plan.about.history ||
    !plan.projectsContact.metaTitle ||
    !plan.projectsContact.metaDescription ||
    !plan.projectsContact.heroTitle ||
    !plan.projectsContact.heroSummary ||
    typeof plan.projectsContact.hasProjectPortfolio !== "boolean" ||
    !plan.projectsContact.contactTitle ||
    !plan.projectsContact.contactIntro
  ) {
    return null;
  }

  if (plan.projectsContact.hasProjectPortfolio) {
    if (!plan.projectsContact.portfolioTitle || !plan.projectsContact.projects) return null;
  }

  return plan as WebsiteUxPlan;
}

export async function designWebsiteUx(brand: BrandProfile): Promise<WebsiteUxPlan> {
  const client = await getOpenAIClient();
  if (!client?.responses) {
    throw new Error(
      "Website UX design requires OpenAI. Set OPENAI_API_KEY, run npm install, and ensure the model returns a valid website UX plan.",
    );
  }

  try {
    const response = await client.responses.create({
      model: process.env.SITEGEN_UX_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      instructions:
        "You are a senior corporate website UX designer and conversion copywriter. Return only valid JSON. Do not use Markdown.",
      input: `Create a website UX and copy plan for a static corporate website that follows this required structure:
- Home page: hero, introduction, partnership logos, testimonials
- About page: mission, vision, team profiles, company history
- Contact page: contact information and a static contact form
- Project Portfolio page: include this only when the company description supports a real portfolio, case studies, client work, projects, or comparable deliverables
- Persistent navigation and footer
- Responsive desktop, tablet, and mobile UX

Company name: ${brand.name}
Company description: ${brand.description}
Brand tone: ${brand.tone}
Palette: ${brand.palette.join(", ")}

Return JSON with this exact shape:
{
  "uxStrategy": "short UX rationale",
  "sectionOrder": {
    "home": ["intro", "partners", "testimonials"],
    "about": ["missionVision", "team", "history"],
    "projects": ["portfolio"],
    "contact": ["contactDetails", "contactForm"]
  },
  "navigation": {"home":"Home","about":"About","projects":"Projects","contact":"Contact"},
  "home": {
    "metaTitle": "...",
    "metaDescription": "...",
    "heroTitle": "...",
    "heroSummary": "...",
    "ctaLabel": "...",
    "introTitle": "...",
    "introCards": [{"title":"...","text":"..."},{"title":"...","text":"..."},{"title":"...","text":"..."}],
    "partnersTitle": "...",
    "testimonialsTitle": "...",
    "testimonials": [{"quote":"...","author":"..."},{"quote":"...","author":"..."}]
  },
  "about": {
    "metaTitle": "...",
    "metaDescription": "...",
    "heroTitle": "...",
    "heroSummary": "...",
    "mission": "...",
    "vision": "...",
    "team": [{"name":"...","role":"...","bio":"..."},{"name":"...","role":"...","bio":"..."},{"name":"...","role":"...","bio":"..."}],
    "history": [{"year":"2022","text":"..."},{"year":"2024","text":"..."},{"year":"2026","text":"..."}]
  },
  "projectsContact": {
    "metaTitle": "...",
    "metaDescription": "...",
    "heroTitle": "...",
    "heroSummary": "...",
    "hasProjectPortfolio": true,
    "portfolioTitle": "...",
    "projects": [{"title":"...","category":"...","text":"..."},{"title":"...","category":"...","text":"..."},{"title":"...","category":"...","text":"..."},{"title":"...","category":"...","text":"..."}],
    "capabilitiesTitle": "...",
    "capabilities": [{"title":"...","text":"..."},{"title":"...","text":"..."},{"title":"...","text":"..."}],
    "contactTitle": "...",
    "contactIntro": "..."
  }
}

Copy depth:
- Write enough copy for each generated page to feel complete, not sparse.
- Hero summaries, mission, vision, contact intro, project descriptions, team bios, timeline entries, testimonials, and intro card text should usually be 2 complete sentences.
- Intro card text, project descriptions, capabilities, team bios, history entries, and testimonials should include concrete business-specific detail instead of one-line generic claims.
- Keep SEO metadata concise, but make visible body copy substantive and useful.

Rules:
- Copy must align with the company description and focus.
- Choose "sectionOrder" based on the nature of the business, audience needs, and the most persuasive information sequence for that company.
- Keep page heroes first; "sectionOrder" only controls the content sections below each hero.
- "sectionOrder.home" must be an exact permutation of "intro", "partners", and "testimonials".
- "sectionOrder.about" must be an exact permutation of "missionVision", "team", and "history".
- "sectionOrder.projects" must be ["portfolio"] when "hasProjectPortfolio" is true and [] when "hasProjectPortfolio" is false.
- "sectionOrder.contact" must be an exact permutation of "contactDetails" and "contactForm".
- Decide "hasProjectPortfolio" from the company description.
- Set "hasProjectPortfolio" to true only when the company likely showcases client work, past work, case studies, built projects, creative work, consulting engagements, construction, architecture, design, agency, studio, or portfolio-like deliverables.
- Set "hasProjectPortfolio" to false for SaaS products, local venues, clinics, ecommerce stores, single-product companies, internal tools, platforms, and businesses where showing past projects would be misleading unless the description explicitly mentions projects, clients, case studies, or portfolio work.
- If "hasProjectPortfolio" is true, provide "portfolioTitle" and exactly 4 "projects"; "capabilitiesTitle" and "capabilities" may still be present but will be ignored.
- If "hasProjectPortfolio" is false, do not invent fake projects; provide "capabilitiesTitle" and exactly 3 "capabilities" for a Home page capabilities section.
- Do not use generic claims that conflict with the company description.
- Keep copy professional and scannable, but avoid terse placeholder-style copy.
- Use realistic placeholder names for team/testimonial authors.
- Write SEO titles and descriptions for each page.`,
    });

    if (!response.output_text) throw new Error("OpenAI returned no UX plan text.");
    const plan = sanitizeUxPlan(parseJsonObject(response.output_text));
    if (!plan) throw new Error("OpenAI returned an invalid UX plan.");
    return plan;
  } catch (error) {
    throw new Error(
      `Website UX design requires OpenAI. ${error instanceof Error ? error.message : "Unknown UX generation error."}`,
    );
  }
}
