import { join } from "node:path";
import { pathExists } from "./state.ts";
import { readTextFile, writeTextFile } from "./fs.ts";

export const CHAT_STATE_PATH = join("dist", "sitegen-chat.json");

export type ChatMessage = {
  type?: "message";
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ChatProgressEvent = {
  type: "progress";
  label: string;
  status: "completed" | "failed";
  createdAt: string;
};

export type ChatTranscriptEntry = ChatMessage | ChatProgressEvent;

export type ChatSupervisorState = {
  version: 2;
  updatedAt: string;
  transcript: ChatTranscriptEntry[];
};

function emptyChatState(): ChatSupervisorState {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    transcript: [],
  };
}

function normalizeTranscriptEntry(entry: unknown): ChatTranscriptEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();

  if (value.type === "progress") {
    if (typeof value.label !== "string" || (value.status !== "completed" && value.status !== "failed")) return null;
    return {
      type: "progress",
      label: value.label,
      status: value.status,
      createdAt,
    };
  }

  if ((value.role === "user" || value.role === "assistant") && typeof value.content === "string") {
    return {
      type: "message",
      role: value.role,
      content: value.content,
      createdAt,
    };
  }

  return null;
}

export async function loadChatState(): Promise<ChatSupervisorState> {
  if (!(await pathExists(CHAT_STATE_PATH))) return emptyChatState();
  const parsed = JSON.parse(await readTextFile(CHAT_STATE_PATH)) as Record<string, unknown>;
  if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.transcript)) return emptyChatState();
  return {
    version: 2,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    transcript: parsed.transcript.map(normalizeTranscriptEntry).filter((entry) => entry !== null),
  };
}

export async function saveChatState(state: ChatSupervisorState): Promise<ChatSupervisorState> {
  const next: ChatSupervisorState = {
    version: 2,
    updatedAt: new Date().toISOString(),
    transcript: state.transcript.slice(-80),
  };
  await writeTextFile(CHAT_STATE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function appendChatMessage(role: ChatMessage["role"], content: string): Promise<ChatSupervisorState> {
  const state = await loadChatState();
  return saveChatState({
    ...state,
    transcript: [
      ...state.transcript,
      {
        type: "message",
        role,
        content,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

export async function appendChatProgress(
  label: string,
  status: ChatProgressEvent["status"],
): Promise<ChatSupervisorState> {
  const state = await loadChatState();
  return saveChatState({
    ...state,
    transcript: [
      ...state.transcript,
      {
        type: "progress",
        label,
        status,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
