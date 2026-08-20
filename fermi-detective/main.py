"""Fermi Detective — CLI entry point.

Wires everything together:

  1. starts the custom MCP tool server (fermi_server.py) over stdio and keeps
     ONE session open for the whole question — the assumption ledger lives in
     that server process, so per-call sessions would lose it;
  2. loads the MCP tools and mixes them with the native LangChain web tools;
  3. runs the hand-rolled LangGraph ReAct loop, streaming the
     Thought / Action / Observation trace as it happens;
  4. prints the final estimate and the assumption audit ledger.

Usage:
    uv run main.py "How many piano tuners work in Warsaw?"
    uv run main.py --model gpt-5-mini "How many breaths in a lifetime?"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools

from agent import NUDGE_TEXT, as_text, build_agent
from formatting import human_number
from web_tools import web_search, wikipedia

_SERVER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fermi_server.py")

# MCP tools the agent itself may call; read_ledger/reset_ledger stay host-only
# so the model cannot tamper with its own audit trail.
AGENT_TOOL_NAMES = ("calculator", "log_assumption")


def mcp_client() -> MultiServerMCPClient:
    """MCP client config: our FastMCP server, same interpreter, stdio transport."""
    return MultiServerMCPClient(
        {"fermi": {"command": sys.executable, "args": [_SERVER_PATH], "transport": "stdio"}}
    )


def _shorten(text: str, limit: int = 380) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[:limit] + " …"


def _print_message(msg) -> None:
    if isinstance(msg, AIMessage):
        text = as_text(msg.content).strip()
        if text:
            print(f"\n🤔 {text}")
        for call in msg.tool_calls:
            args = json.dumps(call["args"], ensure_ascii=False)
            print(f"🔧 Action: {call['name']}({_shorten(args, 300)})")
    elif isinstance(msg, ToolMessage):
        print(f"👁  Observation[{msg.name}]: {_shorten(as_text(msg.content))}")
    elif isinstance(msg, HumanMessage) and as_text(msg.content) == NUDGE_TEXT:
        print("⚠️  Nudge: agent stopped early — pushed to continue or finalize")


async def answer_question(question: str, model: str, session) -> tuple[str, list[dict]]:
    """Run one question through the agent inside an already-open MCP session.

    Returns (final answer text, assumption ledger as list of dicts).
    """
    mcp_tools = {t.name: t for t in await load_mcp_tools(session)}
    await mcp_tools["reset_ledger"].ainvoke({})

    tools = [mcp_tools[name] for name in AGENT_TOOL_NAMES] + [wikipedia, web_search]
    graph = build_agent(tools, model)

    printed, final = 0, ""
    stream = graph.astream(
        {"messages": [HumanMessage(content=question)], "nudges": 0},
        config={"recursion_limit": 80},
        stream_mode="values",
    )
    async for state in stream:
        for msg in state["messages"][printed:]:
            _print_message(msg)
        printed = len(state["messages"])
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and not last.tool_calls:
            final = as_text(last.content)

    ledger = json.loads(as_text(await mcp_tools["read_ledger"].ainvoke({})))
    return final, ledger


def print_ledger(ledger: list[dict]) -> None:
    if not ledger:
        print("\n(assumption ledger is empty — the agent logged nothing)")
        return
    print("\n──── Assumption ledger (audit trail) ────")
    for a in ledger:
        print(
            f" #{a['n']:>2}  {a['name']}: {human_number(a['value'])} {a['unit']}"
            f"   [{human_number(a['low'])} – {human_number(a['high'])}]"
        )
        print(f"      source: {a['source']} — {a['rationale']}")


async def _amain() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Fermi Detective — a ReAct estimation agent")
    parser.add_argument("question", nargs="+", help="a Fermi question to estimate")
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        help="OpenAI chat model (default: %(default)s)",
    )
    args = parser.parse_args()
    question = " ".join(args.question)

    if not os.getenv("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY is not set — copy .env.example to .env and fill it in.")

    print(f"❓ {question}")
    print("─" * 64)
    client = mcp_client()
    async with client.session("fermi") as session:
        final, ledger = await answer_question(question, args.model, session)

    print("\n" + "═" * 64)
    print(final.strip())
    print_ledger(ledger)


if __name__ == "__main__":
    asyncio.run(_amain())
