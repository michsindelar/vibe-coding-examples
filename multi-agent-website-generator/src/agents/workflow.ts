import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateBrandNames } from "./brandNamer.ts";
import { cleanupRejectedPalettes, generateBrandPaletteOptions, writePaletteOptionSvgs } from "./colorStrategist.ts";
import { createDesignBrief } from "./designBriefDesigner.ts";
import { generateStaticSite } from "./frontendEngineer.ts";
import { cleanupRejectedLogos, generateLogoOptions } from "./logoArchitect.ts";
import { cleanupRejectedLockups, generateNameLockups } from "./typographicStylist.ts";
import type { BrandProfile, LogoOption } from "./types.ts";
import { designWebsiteUx } from "./uxDesigner.ts";
import { copyPath, ensureDir, removePath, writeTextFile } from "../utils/fs.ts";
import {
  loadWorkflowState,
  pathExists,
  saveWorkflowState,
  WORKFLOW_STATE_PATH,
  type PendingWorkflowAction,
  type WorkflowRevision,
  type WorkflowState,
  type WorkflowStepId,
} from "../utils/state.ts";

export type SelectableStepId = "brandName" | "palette" | "logo" | "lockup";

export type WorkflowProgress = {
  run<T>(label: string, task: () => Promise<T>): Promise<T>;
};

const STEP_ORDER: WorkflowStepId[] = [
  "description",
  "brandName",
  "palette",
  "logo",
  "lockup",
  "brandProfile",
  "uxPlan",
  "designBrief",
  "website",
];

const STEP_LABELS: Record<WorkflowStepId, string> = {
  description: "Business Description",
  brandName: "Agent 1: Brand Namer",
  palette: "Agent 2: Color Strategist",
  logo: "Agent 3: Logo Architect",
  lockup: "Agent 4: Typographic Stylist",
  brandProfile: "Brand Profile Assembly",
  uxPlan: "Agent 5: Website UX Designer",
  designBrief: "Agent 6: Design Brief Designer",
  website: "Agent 7: Frontend Engineer",
};

const THINKING_LABELS: Partial<Record<WorkflowStepId, string>> = {
  brandName: "Brand Namer is thinking",
  palette: "Color Strategist is thinking",
  logo: "Logo Architect is thinking",
  lockup: "Typographic Stylist is thinking",
  uxPlan: "Website UX Designer is thinking",
  website: "Frontend Engineer is thinking",
};

function withProgress<T>(progress: WorkflowProgress | undefined, label: string, task: () => Promise<T>): Promise<T> {
  return progress ? progress.run(label, task) : task();
}

function stateError(message: string): Error {
  return new Error(`${message} Run npm run clean to start over, or restore the missing generated artifact.`);
}

function optionById<T extends { id: number }>(options: T[] | undefined, optionId: number): T | undefined {
  return options?.find((option) => option.id === optionId);
}

async function requireFile(path: string, label: string): Promise<void> {
  if (!(await pathExists(path))) throw stateError(`${label} is missing: ${path}.`);
}

async function requireOptionFiles(options: LogoOption[] | undefined, label: string): Promise<void> {
  if (!options?.length) throw stateError(`${label} options are missing from ${WORKFLOW_STATE_PATH}.`);
  await Promise.all(options.map((option) => requireFile(option.filePath, `${label} option`)));
}

async function removeOptionArtifacts(options: LogoOption[] | undefined, selected: LogoOption | undefined): Promise<void> {
  const paths = new Set<string>();
  for (const option of options || []) paths.add(option.filePath);
  if (selected) paths.add(selected.filePath);
  await Promise.all([...paths].map(removePath));
}

function completedSteps(state: WorkflowState): WorkflowStepId[] {
  const steps: WorkflowStepId[] = [];
  if (state.description) steps.push("description");
  if (state.selectedName) steps.push("brandName");
  if (state.palette) steps.push("palette");
  if (state.selectedLogo) steps.push("logo");
  if (state.selectedLockup) steps.push("lockup");
  if (state.brand) steps.push("brandProfile");
  if (state.uxPlan) steps.push("uxPlan");
  if (state.designBrief) steps.push("designBrief");
  if (state.website) steps.push("website");
  return steps;
}

function nextIncompleteFrom(completedStepsList: WorkflowStepId[]): WorkflowStepId | null {
  const completed = new Set(completedStepsList);
  for (const step of STEP_ORDER) {
    if (!completed.has(step)) return step;
  }
  return null;
}

function summarizeOptions(state: WorkflowState): Record<string, unknown> {
  return {
    names: state.names?.map((item, index) => ({ id: index + 1, name: item.name, rationale: item.rationale })) || [],
    palettes: state.paletteOptions?.map((item) => ({
      id: item.id,
      label: item.label,
      colors: item.colors,
      rationale: item.rationale,
      filePath: item.filePath,
    })) || [],
    logos: state.logoOptions?.map((item) => ({ id: item.id, label: item.label, filePath: item.filePath })) || [],
    lockups: state.lockups?.map((item) => ({ id: item.id, label: item.label, filePath: item.filePath })) || [],
  };
}

export function workflowStepNames(): string {
  return STEP_ORDER.map((step) => `${step}: ${STEP_LABELS[step]}`).join("\n");
}

export async function getWorkflowStatus(): Promise<Record<string, unknown>> {
  const state = await loadWorkflowState();
  const webEntrypoint = join("dist", "web", "index.html");
  const hasWebsite = Boolean(state.website) || (await pathExists(webEntrypoint));
  const completed = completedSteps(state);
  if (hasWebsite && !completed.includes("website")) completed.push("website");
  return {
    completedSteps: completed,
    nextStep: nextIncompleteFrom(completed),
    pendingAction: state.pendingAction || null,
    description: state.description || null,
    selectedName: state.selectedName || null,
    selectedPalette: state.palette || null,
    selectedLogo: state.selectedLogo || null,
    selectedLockup: state.selectedLockup || null,
    brand: state.brand || null,
    hasUxPlan: Boolean(state.uxPlan),
    hasDesignBrief: Boolean(state.designBrief),
    hasWebsite,
    website: state.website || (hasWebsite ? { outputDir: join("dist", "web"), entrypoint: webEntrypoint } : null),
    history: state.history || [],
    options: summarizeOptions(state),
  };
}

export async function setWorkflowDescription(description: string): Promise<Record<string, unknown>> {
  const requested = description.trim();
  if (!requested) throw stateError("Business description cannot be empty.");
  const state = await loadWorkflowState();
  if (state.description && state.description !== requested) {
    throw stateError(`Existing checkpoint uses a different business description: "${state.description}".`);
  }
  await saveWorkflowState({ ...state, description: requested });
  return { description: requested, status: await getWorkflowStatus() };
}

async function generateNameOptions(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.description) throw stateError("Cannot generate brand names without a business description.");
  const description = state.description;
  if (!state.names) {
    state = await saveWorkflowState({
      ...state,
      names: await withProgress(progress, THINKING_LABELS.brandName || STEP_LABELS.brandName, () => generateBrandNames(description)),
    });
  }
  return state;
}

async function generatePaletteOptions(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.description || !state.selectedName) {
    throw stateError("Cannot generate palettes before brand name selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;
  if (!state.paletteOptions) {
    state = await saveWorkflowState({
      ...state,
      paletteOptions: await withProgress(progress, THINKING_LABELS.palette || STEP_LABELS.palette, () =>
        generateBrandPaletteOptions(selectedName.name, description),
      ),
    });
  } else {
    const paletteOptions = await writePaletteOptionSvgs(state.paletteOptions);
    const selectedPalette = state.palette ? optionById(paletteOptions, state.palette.id) : undefined;
    state = await saveWorkflowState({
      ...state,
      paletteOptions,
      palette: selectedPalette || state.palette,
    });
  }
  return state;
}

async function generateLogoChoices(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.description || !state.selectedName || !state.palette) {
    throw stateError("Cannot generate logos before brand name and palette selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;
  const palette = state.palette;
  if (!state.logoOptions) {
    state = await saveWorkflowState({
      ...state,
      logoOptions: await withProgress(progress, THINKING_LABELS.logo || STEP_LABELS.logo, () =>
        generateLogoOptions(selectedName.name, description, palette.colors),
      ),
    });
  }
  return state;
}

async function generateLockupChoices(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.description || !state.selectedName || !state.selectedLogo || !state.palette) {
    throw stateError("Cannot generate typography lockups before palette and logo selection.");
  }
  const description = state.description;
  const selectedName = state.selectedName;
  const selectedLogo = state.selectedLogo;
  const palette = state.palette;
  if (!state.lockups) {
    state = await saveWorkflowState({
      ...state,
      lockups: await withProgress(progress, THINKING_LABELS.lockup || STEP_LABELS.lockup, () =>
        generateNameLockups(
          selectedName.name,
          selectedLogo.filePath,
          description,
          palette.colors,
        ),
      ),
    });
  }
  return state;
}

export async function generateOptions(step: SelectableStepId, progress?: WorkflowProgress): Promise<Record<string, unknown>> {
  let state = await loadWorkflowState();
  if (step === "brandName") state = await generateNameOptions(state, progress);
  if (step === "palette") state = await generatePaletteOptions(state, progress);
  if (step === "logo") state = await generateLogoChoices(state, progress);
  if (step === "lockup") state = await generateLockupChoices(state, progress);
  return { step, options: summarizeOptions(state), status: await getWorkflowStatus() };
}

export async function selectOption(step: SelectableStepId, optionId: number): Promise<Record<string, unknown>> {
  let state = await loadWorkflowState();
  if (step === "brandName") {
    if (!state.names) throw stateError("Brand name options are missing from saved workflow state.");
    const selectedName = state.names[optionId - 1];
    if (!selectedName) throw stateError(`Brand name option ${optionId} is not available.`);
    state = await saveWorkflowState({ ...state, selectedName });
  }

  if (step === "palette") {
    if (!state.paletteOptions) throw stateError("Palette options are missing from saved workflow state.");
    const paletteOptions = await writePaletteOptionSvgs(state.paletteOptions);
    const palette = optionById(paletteOptions, optionId);
    if (!palette) throw stateError(`Palette option ${optionId} is not available.`);
    state = await saveWorkflowState({ ...state, paletteOptions, palette });
    await cleanupRejectedPalettes(paletteOptions, palette);
  }

  if (step === "logo") {
    if (!state.logoOptions) throw stateError("Logo options are missing from saved workflow state.");
    const logoOptions = state.logoOptions;
    await requireOptionFiles(logoOptions, "Logo");
    const selectedLogo = optionById(logoOptions, optionId);
    if (!selectedLogo) throw stateError(`Logo option ${optionId} is not available.`);
    state = await saveWorkflowState({ ...state, selectedLogo });
    await cleanupRejectedLogos(logoOptions, selectedLogo);
  }

  if (step === "lockup") {
    if (!state.lockups) throw stateError("Typography lockup options are missing from saved workflow state.");
    const lockups = state.lockups;
    await requireOptionFiles(lockups, "Typography lockup");
    const selectedLockup = optionById(lockups, optionId);
    if (!selectedLockup) throw stateError(`Typography lockup option ${optionId} is not available.`);
    state = await saveWorkflowState({ ...state, selectedLockup });
    await cleanupRejectedLockups(lockups, selectedLockup);
  }

  return { step, optionId, status: await getWorkflowStatus() };
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

async function designUx(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.brand) throw stateError("Cannot design website UX before brand profile assembly.");
  const brand = state.brand;
  if (!state.uxPlan) {
    state = await saveWorkflowState({
      ...state,
      uxPlan: await withProgress(progress, THINKING_LABELS.uxPlan || STEP_LABELS.uxPlan, () => designWebsiteUx(brand)),
    });
  }
  return state;
}

async function createDesignBriefStep(state: WorkflowState): Promise<WorkflowState> {
  if (!state.brand || !state.uxPlan) throw stateError("Cannot create a design brief before UX planning.");
  if (!state.designBrief) state = await saveWorkflowState({ ...state, designBrief: await createDesignBrief(state.brand, state.uxPlan) });
  return state;
}

async function generateWebsiteStep(state: WorkflowState, progress?: WorkflowProgress): Promise<WorkflowState> {
  if (!state.designBrief) throw stateError("Cannot generate website before design brief generation.");
  const designBrief = state.designBrief;
  const outputDir = await withProgress(progress, THINKING_LABELS.website || STEP_LABELS.website, () =>
    generateStaticSite(designBrief),
  );
  return saveWorkflowState({
    ...state,
    website: {
      outputDir,
      entrypoint: join(outputDir, "index.html"),
      generatedAt: new Date().toISOString(),
    },
  });
}

export async function runUntil(targetStep: WorkflowStepId, progress?: WorkflowProgress): Promise<Record<string, unknown>> {
  let state = await loadWorkflowState();
  const targetIndex = STEP_ORDER.indexOf(targetStep);
  if (targetIndex < 0) throw stateError(`Unknown target step: ${targetStep}.`);

  for (const step of STEP_ORDER) {
    const stepIndex = STEP_ORDER.indexOf(step);
    if (stepIndex > targetIndex) break;
    if (step === "brandName" && state.names && !state.selectedName) break;
    if (step === "palette" && state.paletteOptions && !state.palette) {
      state = await generatePaletteOptions(state, progress);
      break;
    }
    if (step === "logo" && state.logoOptions && !state.selectedLogo) break;
    if (step === "lockup" && state.lockups && !state.selectedLockup) break;

    if (step === "description") {
      if (!state.description) throw stateError("Business description is required before continuing.");
    }
    if (step === "brandName") {
      state = await generateNameOptions(state, progress);
      if (!state.selectedName) break;
    }
    if (step === "palette") {
      state = await generatePaletteOptions(state, progress);
      if (!state.palette) break;
    }
    if (step === "logo") {
      state = await generateLogoChoices(state, progress);
      if (!state.selectedLogo) break;
    }
    if (step === "lockup") {
      state = await generateLockupChoices(state, progress);
      if (!state.selectedLockup) break;
    }
    if (step === "brandProfile") state = await assembleBrandProfile(state);
    if (step === "uxPlan") state = await designUx(state, progress);
    if (step === "designBrief") state = await createDesignBriefStep(state);
    if (step === "website") state = await generateWebsiteStep(state, progress);
  }

  return { targetStep, status: await getWorkflowStatus() };
}

async function archiveIfExists(source: string, target: string): Promise<void> {
  if (await pathExists(source)) await copyPath(source, target);
}

async function archiveCurrentState(state: WorkflowState, reason: string): Promise<WorkflowState> {
  const nextRevision = state.revision + 1;
  const createdAt = new Date().toISOString();
  const id = `rev-${String(nextRevision).padStart(3, "0")}-${createdAt.replace(/[:.]/g, "-")}`;
  const archivePath = join("dist", "history", id);
  const revision: WorkflowRevision = {
    id,
    createdAt,
    reason,
    completedSteps: completedSteps(state),
    archivePath,
  };

  await ensureDir(archivePath);
  await writeTextFile(join(archivePath, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  await archiveIfExists(join("dist", "brand"), join(archivePath, "brand"));
  await archiveIfExists(join("dist", "design"), join(archivePath, "design"));
  await archiveIfExists(join("dist", "web"), join(archivePath, "web"));

  return {
    ...state,
    revision: nextRevision,
    history: [...(state.history || []), revision],
  };
}

function affectedStepsFor(targetStep: WorkflowStepId): WorkflowStepId[] {
  const index = STEP_ORDER.indexOf(targetStep);
  if (index < 0) return [];
  return STEP_ORDER.slice(index);
}

export async function planRewind(targetStep: WorkflowStepId, reason: string): Promise<Record<string, unknown>> {
  const state = await loadWorkflowState();
  const action: PendingWorkflowAction = {
    type: "rewind",
    targetStep,
    affectedSteps: affectedStepsFor(targetStep),
    reason: reason.trim() || `Rewind to ${STEP_LABELS[targetStep]}.`,
    createdAt: new Date().toISOString(),
  };
  await saveWorkflowState({ ...state, pendingAction: action });
  return {
    pendingAction: action,
    message: `Confirm before clearing and rerunning: ${action.affectedSteps.map((step) => STEP_LABELS[step]).join(", ")}.`,
  };
}

async function invalidateFrom(state: WorkflowState, targetStep: WorkflowStepId): Promise<WorkflowState> {
  let next: WorkflowState = { ...state, pendingAction: undefined };
  const affected = affectedStepsFor(targetStep);
  if (affected.includes("description")) {
    await removePath(join("dist", "brand"));
    await removePath(join("dist", "logo"));
    await removePath(join("dist", "design"));
    await removePath(join("dist", "web"));
    await ensureDir(join("dist", "brand"));
    return {
      version: 3,
      updatedAt: state.updatedAt,
      revision: state.revision,
      history: state.history || [],
    };
  }
  if (affected.includes("brandName")) {
    next.names = undefined;
    next.selectedName = undefined;
  }
  if (affected.includes("palette")) {
    next.paletteOptions = undefined;
    next.palette = undefined;
    await removePath(join("dist", "brand"));
    await ensureDir(join("dist", "brand"));
  }
  if (affected.includes("logo")) {
    await removeOptionArtifacts(next.logoOptions, next.selectedLogo);
    next.logoOptions = undefined;
    next.selectedLogo = undefined;
    await removePath(join("dist", "logo"));
    await ensureDir(join("dist", "brand"));
  }
  if (affected.includes("lockup")) {
    await removeOptionArtifacts(next.lockups, next.selectedLockup);
    next.lockups = undefined;
    next.selectedLockup = undefined;
  }
  if (affected.includes("brandProfile")) next.brand = undefined;
  if (affected.includes("uxPlan")) next.uxPlan = undefined;
  if (affected.includes("designBrief")) {
    next.designBrief = undefined;
    await removePath(join("dist", "design"));
  }
  if (affected.includes("website")) {
    next.website = undefined;
    await removePath(join("dist", "web"));
  }
  return next;
}

export async function executePendingRewind(): Promise<Record<string, unknown>> {
  let state = await loadWorkflowState();
  const action = state.pendingAction;
  if (!action) return { message: "No pending rewind to execute.", status: await getWorkflowStatus() };

  state = await archiveCurrentState(state, action.reason);
  state = await invalidateFrom(state, action.targetStep);
  await saveWorkflowState(state);
  return {
    message: `Rewound to ${STEP_LABELS[action.targetStep]}. Generate or select the next option to continue.`,
    status: await getWorkflowStatus(),
  };
}

export async function listHistory(): Promise<Record<string, unknown>> {
  const state = await loadWorkflowState();
  return { history: state.history || [] };
}

export async function restoreSnapshot(revisionId: string): Promise<Record<string, unknown>> {
  let state = await loadWorkflowState();
  const revision = (state.history || []).find((item) => item.id === revisionId);
  if (!revision) throw stateError(`Revision ${revisionId} is not available in workflow history.`);

  state = await archiveCurrentState(state, `Snapshot before restoring ${revisionId}.`);
  const archivedState = JSON.parse(await readFile(join(revision.archivePath, "state.json"), "utf8")) as WorkflowState;
  await removePath(join("dist", "brand"));
  await removePath(join("dist", "logo"));
  await removePath(join("dist", "design"));
  await removePath(join("dist", "web"));
  await archiveIfExists(join(revision.archivePath, "brand"), join("dist", "brand"));
  await archiveIfExists(join(revision.archivePath, "design"), join("dist", "design"));
  await archiveIfExists(join(revision.archivePath, "web"), join("dist", "web"));
  await ensureDir(join("dist", "brand"));

  await saveWorkflowState({
    ...archivedState,
    version: 3,
    revision: state.revision,
    history: state.history || [],
    pendingAction: undefined,
  });
  return { message: `Restored ${revisionId}.`, status: await getWorkflowStatus() };
}
