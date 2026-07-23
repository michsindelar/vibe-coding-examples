import type { BaseMessage, MessageContent } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Flatten message content (plain string or content-block array) to text. */
function contentToText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (block.type === "image" || block.type === "image_url") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** One dim line per tool call; `run-code` shows the first line of the code. */
function describeToolCall(name: string, args: Record<string, unknown>): string {
  if (typeof args.code === "string") {
    const firstLine = args.code.split("\n").find((l) => l.trim()) ?? "";
    return `${name}(${args.languageId ?? "?"}): ${truncate(firstLine.trim(), 120)}`;
  }
  return `${name}(${truncate(JSON.stringify(args), 200)})`;
}

/** Render an `agent` node update: tool-call lines, narration, or the final answer. */
export function renderAgentUpdate(messages: BaseMessage[]): void {
  for (const message of messages) {
    if (message.getType() !== "ai") continue;
    const ai = message as AIMessage;
    const text = contentToText(ai.content).trim();

    if (ai.tool_calls?.length) {
      // Any text alongside tool calls is interim narration — show it dimmed.
      if (text) console.log(`${DIM}${text}${RESET}`);
      for (const call of ai.tool_calls) {
        console.log(`${DIM}⚙ ${describeToolCall(call.name, call.args)}${RESET}`);
      }
    } else if (text) {
      // No tool calls → this is the answer for this turn.
      console.log(`\n${BOLD}${CYAN}assistant>${RESET} ${text}\n`);
    }
  }
}

/** Render a `tools` node update: truncated tool output. */
export function renderToolUpdate(messages: BaseMessage[]): void {
  for (const message of messages) {
    if (message.getType() !== "tool") continue;
    const text = contentToText(message.content).trim();
    if (text) console.log(`${DIM}↳ ${truncate(text, 500)}${RESET}`);
  }
}
