import { join } from "node:path";
import { generateBrandNames } from "./brandNamer.ts";
import { cleanupRejectedPalettes, generateBrandPaletteOptions, writePaletteOptionSvgs } from "./colorStrategist.ts";
import { createDesignBrief } from "./designBriefDesigner.ts";
import { generateStaticSite } from "./frontendEngineer.ts";
import { cleanupRejectedLogos, generateLogoOptions } from "./logoArchitect.ts";
import { cleanupRejectedLockups, generateNameLockups } from "./typographicStylist.ts";
import type { BrandName, BrandPalette, BrandProfile, LogoOption } from "./types.ts";
import { designWebsiteUx } from "./uxDesigner.ts";
import {
  printInfo,
  printStepHeading,
  printSuccess,
  promptSelect,
  withAiSpinner,
} from "../utils/cli.ts";
import { ensureDir } from "../utils/fs.ts";
import {
  loadWorkflowState,
  pathExists,
  saveWorkflowState,
  WORKFLOW_STATE_PATH,
  type WorkflowState,
} from "../utils/state.ts";

export type SupervisorOptions = {
  auto: boolean;
};

type SupervisorStepId =
  | "description"
  | "brandName"
  | "palette"
  | "logo"
  | "lockup"
  | "brandProfile"
  | "uxPlan"
  | "designAndWebsite";

type SupervisorStep = {
  id: SupervisorStepId;
  label: string;
  run(state: WorkflowState, options: SupervisorOptions): Promise<WorkflowState>;
};

function stateError(message: string): Error {
  return new Error(`${message} Run npm run clean to start over, or restore the missing generated artifact.`);
}

function hasOption<T extends { id: number; label: string }>(options: T[] | undefined, selected: T | undefined): boolean {
  return Boolean(selected && options?.some((option) => option.id === selected.id && option.label === selected.label));
}

function hasBrandName(options: BrandName[] | undefined, selected: BrandName | undefined): boolean {
  return Boolean(selected && options?.some((option) => option.name === selected.name && option.rationale === selected.rationale));
}

function hasPalette(options: BrandPalette[] | undefined, selected: BrandPalette | undefined): boolean {
  return Boolean(
    selected &&
      options?.some(
        (option) =>
          option.id === selected.id &&
          option.label === selected.label &&
          option.rationale === selected.rationale &&
          option.colors.join("|") === selected.colors.join("|"),
      ),
  );
}

async function requireFile(path: string, label: string): Promise<void> {
  if (!(await pathExists(path))) throw stateError(`${label} is missing: ${path}.`);
}

async function requireOptionFiles(options: LogoOption[] | undefined, label: string): Promise<void> {
  if (!options?.length) throw stateError(`${label} options are missing from ${WORKFLOW_STATE_PATH}.`);
  await Promise.all(options.map((option) => requireFile(option.filePath, `${label} option`)));
}

async function resolveDescription(state: WorkflowState, _options: SupervisorOptions): Promise<WorkflowState> {
  if (state.description) {
    printInfo(`Resuming workflow from ${WORKFLOW_STATE_PATH}.`);
    return state;
  }

  throw new Error("Business description is required before running the fixed workflow. Start the chat with npm start and enter the description there.");
}

async function selectBrandName(state: WorkflowState, options: SupervisorOptions): Promise<WorkflowState> {
  if (!state.description) throw stateError("Cannot generate brand names without a business description.");
  const description = state.description;

  printStepHeading("Agent 1: Brand Namer");
  if (!state.names) {
    const names = await withAiSpinner("Generating brand name options", () => generateBrandNames(description));
    state = await saveWorkflowState({ ...state, names });
  }
  const names = state.names;
  if (!names) throw stateError("Brand name options are missing from saved workflow state.");
  if (state.selectedName) {
    if (!hasBrandName(names, state.selectedName)) {
      throw stateError("Selected brand name is not present in saved brand name options.");
    }
    return state;
  }

  const selectedName = await promptSelect(
    "Select a company name",
    names,
    (item) => `${item.name} - ${item.rationale}`,
    options.auto,
  );
  return saveWorkflowState({ ...state, selectedName });
}

async function selectPalette(state: WorkflowState, options: SupervisorOptions): Promise<WorkflowState> {
  if (!state.description || !state.selectedName) {
    throw stateError("Cannot select a palette before brand name selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;

  printStepHeading("Agent 2: Color Strategist");
  if (!state.paletteOptions) {
    const paletteOptions = await withAiSpinner(
      "Generating brand color palettes",
      () => generateBrandPaletteOptions(
        selectedName.name,
        description,
      ),
    );
    state = await saveWorkflowState({
      ...state,
      paletteOptions,
    });
  } else {
    const paletteOptions = await writePaletteOptionSvgs(state.paletteOptions);
    const selectedPalette = state.palette ? paletteOptions.find((option) => option.id === state.palette?.id) : undefined;
    state = await saveWorkflowState({
      ...state,
      paletteOptions,
      palette: selectedPalette || state.palette,
    });
  }
  const paletteOptions = state.paletteOptions;
  if (!paletteOptions) throw stateError("Palette options are missing from saved workflow state.");
  if (paletteOptions.length !== 3) {
    throw stateError("Saved palette options must contain exactly 3 palettes.");
  }

  if (state.palette) {
    if (!hasPalette(paletteOptions, state.palette)) {
      throw stateError("Selected palette is not present in saved palette options.");
    }
    await cleanupRejectedPalettes(paletteOptions, state.palette);
    printSuccess(`Selected palette: ${state.palette.colors.join(", ")} - ${state.palette.rationale}`);
    return state;
  }

  const palette = await promptSelect(
    "Select a brand color palette",
    paletteOptions,
    (item) => `${item.label}: ${item.colors.join(", ")} - ${item.rationale} (${item.filePath})`,
    options.auto,
  );
  state = await saveWorkflowState({
    ...state,
    palette,
  });
  await cleanupRejectedPalettes(paletteOptions, palette);
  printSuccess(`Selected palette: ${palette.colors.join(", ")} - ${palette.rationale}`);
  return state;
}

async function selectLogo(state: WorkflowState, options: SupervisorOptions): Promise<WorkflowState> {
  if (!state.description || !state.selectedName || !state.palette) {
    throw stateError("Cannot generate logos before brand name and palette selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;
  const palette = state.palette;

  printStepHeading("Agent 3: Logo Architect");
  if (!state.logoOptions) {
    const logoOptions = await withAiSpinner(
      "Generating logo SVG options",
      () => generateLogoOptions(selectedName.name, description, palette.colors),
    );
    state = await saveWorkflowState({
      ...state,
      logoOptions,
    });
  }
  const logoOptions = state.logoOptions;
  if (!logoOptions) throw stateError("Logo options are missing from saved workflow state.");

  if (state.selectedLogo) {
    if (!hasOption(logoOptions, state.selectedLogo)) {
      throw stateError("Selected logo is not present in saved logo options.");
    }
    await requireFile(state.selectedLogo.filePath, "Selected logo");
    await cleanupRejectedLogos(logoOptions, state.selectedLogo);
    return state;
  }

  await requireOptionFiles(logoOptions, "Logo");
  const selectedLogo = await promptSelect(
    "Select a logo SVG",
    logoOptions,
    (item) => `${item.label} (${item.filePath})`,
    options.auto,
  );
  state = await saveWorkflowState({ ...state, selectedLogo });
  await cleanupRejectedLogos(logoOptions, selectedLogo);
  return state;
}

async function selectLockup(state: WorkflowState, options: SupervisorOptions): Promise<WorkflowState> {
  if (!state.description || !state.selectedName || !state.selectedLogo || !state.palette) {
    throw stateError("Cannot generate typography lockups before palette and logo selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;
  const selectedLogo = state.selectedLogo;
  const palette = state.palette;

  printStepHeading("Agent 4: Typographic Stylist");
  if (!state.lockups) {
    const lockups = await withAiSpinner(
      "Generating typography lockups",
      () => generateNameLockups(
        selectedName.name,
        selectedLogo.filePath,
        description,
        palette.colors,
      ),
    );
    state = await saveWorkflowState({
      ...state,
      lockups,
    });
  }
  const lockups = state.lockups;
  if (!lockups) throw stateError("Typography lockup options are missing from saved workflow state.");

  if (state.selectedLockup) {
    if (!hasOption(lockups, state.selectedLockup)) {
      throw stateError("Selected typography lockup is not present in saved lockup options.");
    }
    await requireFile(state.selectedLockup.filePath, "Selected typography lockup");
    await cleanupRejectedLockups(lockups, state.selectedLockup);
    return state;
  }

  await requireOptionFiles(lockups, "Typography lockup");
  const selectedLockup = await promptSelect(
    "Select a final logo and name lockup",
    lockups,
    (item) => `${item.label} (${item.filePath})`,
    options.auto,
  );
  state = await saveWorkflowState({ ...state, selectedLockup });
  await cleanupRejectedLockups(lockups, selectedLockup);
  return state;
}

async function assembleBrandProfile(state: WorkflowState): Promise<WorkflowState> {
  const description = state.description;
  const selectedName = state.selectedName;
  const selectedLogo = state.selectedLogo;
  const selectedLockup = state.selectedLockup;
  const palette = state.palette;
  if (!description || !selectedName || !selectedLogo || !selectedLockup || !palette) {
    throw stateError("Cannot assemble brand profile from incomplete saved workflow state.");
  }

  if (!state.brand) {
    const brand: BrandProfile = {
      description,
      name: selectedName.name,
      logoPath: selectedLogo.filePath,
      lockupPath: selectedLockup.filePath,
      palette: palette.colors,
      tone: "Professional, clear, launch-ready",
    };
    state = await saveWorkflowState({ ...state, brand });
  }

  const brand = state.brand;
  if (!brand) throw stateError("Brand profile is missing from saved workflow state.");
  await requireFile(brand.logoPath, "Brand logo");
  await requireFile(brand.lockupPath, "Brand lockup");
  return state;
}

async function designUx(state: WorkflowState): Promise<WorkflowState> {
  if (!state.brand) throw stateError("Cannot design website UX before brand profile assembly.");
  const brand = state.brand;

  printStepHeading("Agent 5: Website UX Designer");
  if (!state.uxPlan) {
    const uxPlan = await withAiSpinner("Designing website UX and copy plan", () => designWebsiteUx(brand));
    state = await saveWorkflowState({ ...state, uxPlan });
  }
  const uxPlan = state.uxPlan;
  if (!uxPlan) throw stateError("UX plan is missing from saved workflow state.");
  printInfo(`UX strategy: ${uxPlan.uxStrategy}`);
  return state;
}

async function createDesignAndWebsite(state: WorkflowState): Promise<WorkflowState> {
  if (!state.brand || !state.uxPlan) throw stateError("Cannot create a design brief before UX planning.");
  const brand = state.brand;
  const uxPlan = state.uxPlan;

  printStepHeading("Agent 6: Design Brief Designer");
  if (!state.designBrief) {
    const designBrief = await withAiSpinner(
      "Creating design brief",
      () => createDesignBrief(brand, uxPlan),
    );
    state = await saveWorkflowState({ ...state, designBrief });
  }
  const designBrief = state.designBrief;
  if (!designBrief) throw stateError("Design brief is missing from saved workflow state.");
  printSuccess("Design brief ready: dist/design/design-brief.json");

  printStepHeading("Agent 7: Frontend Engineer");
  const outputDir = await withAiSpinner("Generating static website", () => generateStaticSite(designBrief));
  state = await saveWorkflowState({
    ...state,
    website: {
      outputDir,
      entrypoint: join(outputDir, "index.html"),
      generatedAt: new Date().toISOString(),
    },
  });
  printSuccess(`Generated static website in ${outputDir}/.`);
  printInfo("Open dist/web/index.html in a browser to inspect the result.");
  return state;
}

const supervisorSteps: SupervisorStep[] = [
  { id: "description", label: "Business Description", run: resolveDescription },
  { id: "brandName", label: "Agent 1: Brand Namer", run: selectBrandName },
  { id: "palette", label: "Agent 2: Color Strategist", run: selectPalette },
  { id: "logo", label: "Agent 3: Logo Architect", run: selectLogo },
  { id: "lockup", label: "Agent 4: Typographic Stylist", run: selectLockup },
  { id: "brandProfile", label: "Brand Profile Assembly", run: assembleBrandProfile },
  { id: "uxPlan", label: "Agent 5: Website UX Designer", run: designUx },
  { id: "designAndWebsite", label: "Agents 6-7: Design Brief and Frontend", run: createDesignAndWebsite },
];

export async function runSupervisor(options: SupervisorOptions): Promise<void> {
  await ensureDir(join("dist", "brand"));
  let state = await loadWorkflowState();

  for (const step of supervisorSteps) {
    state = await step.run(state, options);
  }
}
