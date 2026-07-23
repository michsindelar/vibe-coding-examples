"""CLI REPL: env check, streaming loop, per-turn file tracking."""

import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = PROJECT_ROOT / "output"

BANNER = """
📈 Finance research agent — LangGraph + two MCP servers (yfinance + python-sandbox)
   Try:
   • Compare AAPL and MSFT over the last year and summarize the latest earnings surprises.
   • What was NVDA's best month in 2025?
   • Which of the two had the worse max drawdown?  (follow-ups keep context)
   Type "exit" to quit. CSVs and charts are saved to ./output/
"""


def new_files_since(since: float) -> list[str]:
    """List files in the workspace modified after `since`."""
    return sorted(
        f"output/{p.name}"
        for p in WORKSPACE.iterdir()
        if p.is_file() and not p.name.startswith(".") and p.stat().st_mtime >= since
    )


async def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit(
            "ANTHROPIC_API_KEY is not set.\n"
            "Copy .env.example to .env and add your key, or export it in your shell."
        )

    WORKSPACE.mkdir(exist_ok=True)

    from agent import create_agent  # deferred: slow imports after the env check
    from render import render_agent_update, render_tool_update

    print("Starting agent (spawning the two MCP servers to discover tools)…")
    agent = await create_agent(WORKSPACE)
    config = {"configurable": {"thread_id": str(uuid.uuid4())}, "recursion_limit": 50}

    print(BANNER)
    while True:
        try:
            line = (await asyncio.to_thread(input, "you> ")).strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line:
            continue
        if line.lower() in ("exit", "quit"):
            break

        turn_start = time.time()
        try:
            async for chunk in agent.astream(
                {"messages": [{"role": "user", "content": line}]},
                config,
                stream_mode="updates",
            ):
                if "agent" in chunk:
                    render_agent_update(chunk["agent"]["messages"])
                if "tools" in chunk:
                    render_tool_update(chunk["tools"]["messages"])

            files = new_files_since(turn_start)
            if files:
                print(f"Files written: {', '.join(files)}\n")
        except Exception as exc:  # a failed turn must not kill the REPL
            print(f"\n✖ {exc}\n", file=sys.stderr)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:  # Ctrl-C mid-turn: exit without a traceback
        pass
