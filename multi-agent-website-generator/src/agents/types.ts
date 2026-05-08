export type BrandName = {
  name: string;
  rationale: string;
};

export type LogoOption = {
  id: number;
  label: string;
  filePath: string;
  source?: "openai" | "local";
};

export type LogoDraft = {
  label: string;
  svg: string;
};

export type TypographySuggestion = {
  label: string;
  font: string;
  weight: number;
  color: string;
  layout: "horizontal" | "stacked" | "compact";
  rationale: string;
};

export type BrandPalette = {
  id: number;
  label: string;
  colors: [string, string, string];
  rationale: string;
  filePath?: string;
};

export type BrandProfile = {
  description: string;
  name: string;
  logoPath: string;
  lockupPath: string;
  palette: string[];
  tone: string;
};

export type TextCard = {
  title: string;
  text: string;
};

export type TestimonialCopy = {
  quote: string;
  author: string;
};

export type TeamMemberCopy = {
  name: string;
  role: string;
  bio: string;
};

export type TimelineItemCopy = {
  year: string;
  text: string;
};

export type ProjectCopy = {
  title: string;
  category: string;
  text: string;
};

export type HomeSectionKey = "intro" | "partners" | "testimonials";
export type AboutSectionKey = "missionVision" | "team" | "history";
export type ProjectSectionKey = "portfolio";
export type ContactSectionKey = "contactDetails" | "contactForm";

export type WebsiteSectionOrder = {
  home: HomeSectionKey[];
  about: AboutSectionKey[];
  projects: ProjectSectionKey[];
  contact: ContactSectionKey[];
};

export type WebsiteUxPlan = {
  uxStrategy: string;
  sectionOrder: WebsiteSectionOrder;
  navigation: {
    home: string;
    about: string;
    projects: string;
    contact: string;
  };
  home: {
    metaTitle: string;
    metaDescription: string;
    heroTitle: string;
    heroSummary: string;
    ctaLabel: string;
    introTitle: string;
    introCards: [TextCard, TextCard, TextCard];
    partnersTitle: string;
    testimonialsTitle: string;
    testimonials: [TestimonialCopy, TestimonialCopy];
  };
  about: {
    metaTitle: string;
    metaDescription: string;
    heroTitle: string;
    heroSummary: string;
    mission: string;
    vision: string;
    team: [TeamMemberCopy, TeamMemberCopy, TeamMemberCopy];
    history: [TimelineItemCopy, TimelineItemCopy, TimelineItemCopy];
  };
  projectsContact: {
    metaTitle: string;
    metaDescription: string;
    heroTitle: string;
    heroSummary: string;
    hasProjectPortfolio: boolean;
    portfolioTitle?: string;
    projects?: [ProjectCopy, ProjectCopy, ProjectCopy, ProjectCopy];
    capabilitiesTitle?: string;
    capabilities?: [TextCard, TextCard, TextCard];
    contactTitle: string;
    contactIntro: string;
  };
};

export type DesignBrief = {
  brand: BrandProfile;
  uxPlan: WebsiteUxPlan;
  sections: string[];
  layoutNotes: string[];
  generatedAt: string;
};
