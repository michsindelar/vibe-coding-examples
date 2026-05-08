import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import {
  executePendingRewind,
  generateOptions,
  getWorkflowStatus,
  listHistory,
  planRewind,
  restoreSnapshot,
  runUntil,
  selectOption,
  setWorkflowDescription,
  workflowStepNames,
  type SelectableStepId,
  type WorkflowProgress,
} from "./workflow.ts";
import {
  createLiveProgressTracker,
  printAssistantMessage,
  printInfo,
  printProgressEvent,
  printStepHeading,
  printUserMessage,
  promptText,
} from "../utils/cli.ts";
import {
  appendChatMessage,
  appendChatProgress,
  loadChatState,
  type ChatMessage,
  type ChatProgressEvent,
  type ChatTranscriptEntry,
} from "../utils/chatState.ts";
import { loadWorkflowState, pathExists, type WorkflowStepId } from "../utils/state.ts";

const selectableStepSchema = z.enum(["brandName", "palette", "logo", "lockup"]);
const workflowStepSchema = z.enum([
  "description",
  "brandName",
  "palette",
  "logo",
  "lockup",
  "brandProfile",
  "uxPlan",
  "designBrief",
  "website",
]);
const SUPERVISOR_THINKING_LABEL = "Supervisor is thinking";

function requireOpenAI(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "AI supervisor chat requires OpenAI. Set OPENAI_API_KEY, run npm install, and start the CLI again.",
    );
  }
}

function compact(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function removeMarkdownBoldTags(value: string): string {
  return value.replace(/\*\*([^*\n](?:[^*]|\*(?!\*))*)\*\*/g, "$1");
}

function isChatMessage(entry: ChatTranscriptEntry): entry is ChatMessage {
  return entry.type !== "progress";
}

function printChatHistoryMessage(message: ChatMessage): void {
  if (message.role === "assistant") {
    printAssistantMessage(message.content);
    return;
  }

  printUserMessage(message.content);
}

function printChatHistoryEntry(entry: ChatTranscriptEntry): void {
  if (entry.type === "progress") {
    printProgressEvent(entry.label, entry.status);
    return;
  }

  printChatHistoryMessage(entry);
}

async function displayExistingChatHistory(): Promise<void> {
  if (!(await pathExists("dist"))) return;
  const chatState = await loadChatState();
  if (!chatState.transcript.length) return;

  printStepHeading("Chat history");
  const firstMessage = chatState.transcript.find(isChatMessage);
  if (firstMessage?.role === "user") {
    printAssistantMessage("Describe the business:");
  }
  for (const entry of chatState.transcript) {
    printChatHistoryEntry(entry);
  }
}

async function createSupervisorAgent(progress?: WorkflowProgress): Promise<Agent> {
  const status = await getWorkflowStatus();
  const chatState = await loadChatState();
  const recentTranscript = chatState.transcript
    .filter(isChatMessage)
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const tools = [
    tool({
      name: "get_status",
      description: "Inspect the current SiteGen workflow status, selections, pending rewind, history, and available options.",
      parameters: z.object({}),
      async execute() {
        return compact(await getWorkflowStatus());
      },
    }),
    tool({
      name: "set_description",
      description: "Set the business description when no description exists yet.",
      parameters: z.object({
        description: z.string().describe("The user's business description."),
      }),
      async execute(input) {
        return compact(await setWorkflowDescription(input.description));
      },
    }),
    tool({
      name: "generate_options",
      description: "Generate options for a selectable workflow step. Use this for names, palettes, logos, or typography lockups.",
      parameters: z.object({
        step: selectableStepSchema,
      }),
      async execute(input) {
        return compact(await generateOptions(input.step as SelectableStepId, progress));
      },
    }),
    tool({
      name: "select_option",
      description: "Select one generated option for a selectable workflow step by numeric option id.",
      parameters: z.object({
        step: selectableStepSchema,
        optionId: z.number().int().min(1),
      }),
      async execute(input) {
        return compact(await selectOption(input.step as SelectableStepId, input.optionId));
      },
    }),
    tool({
      name: "run_until",
      description:
        "Run deterministic workflow stages up to a target step. Stops before any step that needs a user choice from generated options.",
      parameters: z.object({
        targetStep: workflowStepSchema,
      }),
      async execute(input) {
        return compact(await runUntil(input.targetStep as WorkflowStepId, progress));
      },
    }),
    tool({
      name: "plan_rewind",
      description:
        "Plan a rewind to an earlier workflow step. This records a pending action and explains affected downstream stages, but does not mutate generated outputs yet.",
      parameters: z.object({
        targetStep: workflowStepSchema,
        reason: z.string(),
      }),
      async execute(input) {
        return compact(await planRewind(input.targetStep as WorkflowStepId, input.reason));
      },
    }),
    tool({
      name: "execute_pending_rewind",
      description:
        "Execute the already planned rewind after the user clearly confirms it. Archives current artifacts, clears affected state, and returns the new status.",
      parameters: z.object({}),
      async execute() {
        return compact(await executePendingRewind());
      },
    }),
    tool({
      name: "list_history",
      description: "List archived workflow revisions that can be restored.",
      parameters: z.object({}),
      async execute() {
        return compact(await listHistory());
      },
    }),
    tool({
      name: "restore_snapshot",
      description: "Restore a previously archived workflow revision by id after the user requests it.",
      parameters: z.object({
        revisionId: z.string(),
      }),
      async execute(input) {
        return compact(await restoreSnapshot(input.revisionId));
      },
    }),
  ];

  return new Agent({
    name: "SiteGen Supervisor",
    model: process.env.SITEGEN_SUPERVISOR_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
    instructions: `You are the AI supervisor for SiteGen, a CLI that creates brand identity and static websites.

You own the user-facing conversation. Use local tools as the source of truth for workflow state and mutations. Never pretend a workflow step has completed unless a tool says it has.

Workflow steps:
${workflowStepNames()}

Current status:
${compact(status)}

Recent conversation:
${recentTranscript || "(none)"}

Operating rules:
- If no business description exists and the user provides one, call set_description.
- For selectable stages, call generate_options, present the numbered options clearly, and ask the user which one to use.
- When presenting palette options, include each generated SVG path so the user can inspect dist/brand/palette_*.svg before choosing.
- When the user picks an option in natural language, call select_option with the matching numeric id.
- Use run_until to continue through deterministic stages. It will stop where a choice is required.
- If the user asks to change an earlier choice, call plan_rewind first and explain affected downstream stages. Do not call execute_pending_rewind until the user clearly confirms.
- If the user confirms a pending rewind, call execute_pending_rewind, then guide them to generate/select the next needed options.
- Keep replies concise and actionable. Mention generated files only when useful, especially dist/web/index.html after website generation.
- Use plain text only. Do not use Markdown formatting such as **bold**, __bold__, headings, tables, or code fences in user-facing replies.`,
    tools,
  });
}

function createChatProgress(): WorkflowProgress & {
  switchTo(label: string): Promise<void>;
  finish(status: ChatProgressEvent["status"]): Promise<void>;
} {
  const liveProgress = createLiveProgressTracker();

  async function persistCurrent(status: ChatProgressEvent["status"]): Promise<void> {
    const label = liveProgress.currentLabel();
    if (!label) return;
    if (status === "completed") {
      liveProgress.succeed();
    } else {
      liveProgress.fail();
    }
    await appendChatProgress(label, status);
  }

  async function switchTo(label: string): Promise<void> {
    if (liveProgress.currentLabel() === label) return;
    await persistCurrent("completed");
    liveProgress.switchTo(label);
  }

  return {
    switchTo,
    finish: persistCurrent,
    async run<T>(label: string, task: () => Promise<T>): Promise<T> {
      await switchTo(label);
      try {
        const result = await task();
        await persistCurrent("completed");
        liveProgress.switchTo(SUPERVISOR_THINKING_LABEL);
        return result;
      } catch (error) {
        await persistCurrent("failed");
        throw error;
      }
    },
  };
}

async function runChatTurn(input: string): Promise<string> {
  const progress = createChatProgress();
  const agent = await createSupervisorAgent(progress);
  await progress.switchTo(SUPERVISOR_THINKING_LABEL);
  const result = await run(agent, input, { maxTurns: 12, stream: true });
  try {
    for await (const _event of result) {
      // Progress rows are driven by workflow tool boundaries; token chunks are not printed in chat mode.
    }
    if (result.error) throw result.error;
    await progress.finish("completed");
  } catch (error) {
    await progress.finish("failed");
    throw error;
  }
  return removeMarkdownBoldTags(String(result.finalOutput || "I could not produce a response. Please try again."));
}

async function resolveInitialDescription(): Promise<boolean> {
  const state = await loadWorkflowState();
  if (state.description) return false;

  const descriptionPrompt = "Describe the business";
  await appendChatMessage("assistant", `${descriptionPrompt}:`);
  const description = await promptText(descriptionPrompt);

  await setWorkflowDescription(description);
  await appendChatMessage("user", description);
  return true;
}

export async function runChatSupervisor(): Promise<void> {
  requireOpenAI();
  printInfo("SiteGen AI supervisor chat. Type /exit to quit.");
  await displayExistingChatHistory();
  const startedNewProject = await resolveInitialDescription();
  if (startedNewProject) {
    const output = await runChatTurn(
      "The user provided their business description. Generate company name options now and ask them to choose one.",
    );
    printAssistantMessage(output);
    await appendChatMessage("assistant", output);
  }

  while (true) {
    const input = await promptText("\nYou");
    if (!input || /^\/?(exit|quit)$/i.test(input)) break;
    await appendChatMessage("user", input);
    const output = await runChatTurn(input);
    printAssistantMessage(output);
    await appendChatMessage("assistant", output);
  }
}
