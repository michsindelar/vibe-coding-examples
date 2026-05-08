import { access, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  BrandName,
  BrandPalette,
  BrandProfile,
  DesignBrief,
  LogoOption,
  WebsiteUxPlan,
} from "../agents/types.ts";
import { ensureDir, readTextFile } from "./fs.ts";

export const WORKFLOW_STATE_PATH = join("dist", "sitegen-state.json");

export type WorkflowStepId =
  | "description"
  | "brandName"
  | "palette"
  | "logo"
  | "lockup"
  | "brandProfile"
  | "uxPlan"
  | "designBrief"
  | "website";

export type PendingWorkflowAction = {
  type: "rewind";
  targetStep: WorkflowStepId;
  affectedSteps: WorkflowStepId[];
  reason: string;
  createdAt: string;
};

export type WorkflowRevision = {
  id: string;
  createdAt: string;
  reason: string;
  completedSteps: WorkflowStepId[];
  archivePath: string;
};

export type WebsiteOutput = {
  outputDir: string;
  entrypoint: string;
  generatedAt: string;
};

export type WorkflowState = {
  version: 3;
  updatedAt: string;
  revision: number;
  description?: string;
  names?: BrandName[];
  selectedName?: BrandName;
  logoOptions?: LogoOption[];
  selectedLogo?: LogoOption;
  lockups?: LogoOption[];
  selectedLockup?: LogoOption;
  paletteOptions?: BrandPalette[];
  palette?: BrandPalette;
  brand?: BrandProfile;
  uxPlan?: WebsiteUxPlan;
  designBrief?: DesignBrief;
  website?: WebsiteOutput;
  pendingAction?: PendingWorkflowAction;
  history?: WorkflowRevision[];
};

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): WorkflowState {
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    revision: 0,
    history: [],
  };
}

export async function loadWorkflowState(): Promise<WorkflowState> {
  if (!(await pathExists(WORKFLOW_STATE_PATH))) return emptyState();

  const parsed = JSON.parse(await readTextFile(WORKFLOW_STATE_PATH)) as Omit<Partial<WorkflowState>, "version"> & {
    version?: number;
  };
  if (parsed.version !== 2 && parsed.version !== 3) {
    throw new Error(`Unsupported ${WORKFLOW_STATE_PATH}. Run npm run clean before starting a new workflow.`);
  }

  return {
    ...emptyState(),
    revision: parsed.version === 3 && typeof parsed.revision === "number" ? parsed.revision : 0,
    description: parsed.description,
    names: parsed.names,
    selectedName: parsed.selectedName,
    logoOptions: parsed.logoOptions,
    selectedLogo: parsed.selectedLogo,
    lockups: parsed.lockups,
    selectedLockup: parsed.selectedLockup,
    paletteOptions: parsed.paletteOptions,
    palette: parsed.palette,
    brand: parsed.brand,
    uxPlan: parsed.uxPlan,
    designBrief: parsed.designBrief,
    website: parsed.version === 3 ? parsed.website : undefined,
    pendingAction: parsed.version === 3 ? parsed.pendingAction : undefined,
    history: parsed.version === 3 && Array.isArray(parsed.history) ? parsed.history : [],
  };
}

export async function saveWorkflowState(state: WorkflowState): Promise<WorkflowState> {
  const next: WorkflowState = {
    version: 3,
    updatedAt: new Date().toISOString(),
    revision: state.revision,
    description: state.description,
    names: state.names,
    selectedName: state.selectedName,
    logoOptions: state.logoOptions,
    selectedLogo: state.selectedLogo,
    lockups: state.lockups,
    selectedLockup: state.selectedLockup,
    paletteOptions: state.paletteOptions,
    palette: state.palette,
    brand: state.brand,
    uxPlan: state.uxPlan,
    designBrief: state.designBrief,
    website: state.website,
    pendingAction: state.pendingAction,
    history: state.history || [],
  };
  const tempPath = `${WORKFLOW_STATE_PATH}.tmp`;
  await ensureDir(dirname(WORKFLOW_STATE_PATH));
  await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tempPath, WORKFLOW_STATE_PATH);
  return next;
}
