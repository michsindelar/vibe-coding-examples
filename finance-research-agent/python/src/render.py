"""Pretty-printing of LangGraph stream updates (tool calls, results, answers)."""

import json

from langchain_core.messages import AIMessage, BaseMessage

DIM = "\x1b[2m"
BOLD = "\x1b[1m"
CYAN = "\x1b[36m"
RESET = "\x1b[0m"


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


def _content_to_text(content) -> str:
    """Flatten message content (plain string or content-block list) to text."""
    if isinstance(content, str):
        return content
    parts = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "\n".join(p for p in parts if p)


def _describe_tool_call(name: str, args: dict) -> str:
    """One dim line per tool call; run_python shows the first line of code."""
    if name == "run_python" and isinstance(args.get("code"), str):
        first_line = next((l for l in args["code"].splitlines() if l.strip()), "")
        return f"{name}: {_truncate(first_line.strip(), 120)}"
    return f"{name}({_truncate(json.dumps(args), 200)})"


def render_agent_update(messages: list[BaseMessage]) -> None:
    """Render an `agent` node update: tool-call lines, narration, or the answer."""
    for message in messages:
        if not isinstance(message, AIMessage):
            continue
        text = _content_to_text(message.content).strip()
        if message.tool_calls:
            # Any text alongside tool calls is interim narration — show it dimmed.
            if text:
                print(f"{DIM}{text}{RESET}")
            for call in message.tool_calls:
                print(f"{DIM}⚙ {_describe_tool_call(call['name'], call['args'])}{RESET}")
        elif text:
            # No tool calls → this is the answer for this turn.
            print(f"\n{BOLD}{CYAN}assistant>{RESET} {text}\n")


def render_tool_update(messages: list[BaseMessage]) -> None:
    """Render a `tools` node update: truncated tool output."""
    for message in messages:
        text = _content_to_text(message.content).strip()
        if text:
            print(f"{DIM}↳ {_truncate(text, 500)}{RESET}")
