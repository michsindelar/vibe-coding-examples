"""Smoke test — verifies every component that does NOT need an OpenAI key.

Checks that the MCP server boots over stdio and exposes all four tools, that
the calculator computes correctly and reports errors gracefully, that the
ledger keeps state across separate MCP tool calls within one session, and
that both keyless web tools return live data.

Run:  uv run smoke_test.py
"""

from __future__ import annotations

import asyncio
import json

from langchain_mcp_adapters.tools import load_mcp_tools

from formatting import human_number
from main import as_text, mcp_client
from web_tools import web_search, wikipedia


async def run() -> None:
    client = mcp_client()
    async with client.session("fermi") as session:
        tools = {t.name: t for t in await load_mcp_tools(session)}
        expected = {"calculator", "log_assumption", "read_ledger", "reset_ledger"}
        assert expected <= set(tools), f"missing MCP tools: {expected - set(tools)}"
        print("1. MCP server up, tools:", ", ".join(sorted(tools)))

        result = as_text(
            await tools["calculator"].ainvoke({"expression": "1.86e6 / 2.5 * 0.03 / 180"})
        )
        assert result.startswith("124"), result
        print("2. calculator OK:", result)

        hint = as_text(await tools["calculator"].ainvoke({"expression": "3.45e13 * 1"}))
        assert "≈ 34.5 trillion" in hint, hint
        print("2b. calculator human-readable hint OK:", hint)

        bad = as_text(await tools["calculator"].ainvoke({"expression": "import os"}))
        assert "CALCULATOR ERROR" in bad, bad
        print("3. calculator rejects bad input OK:", bad[:70], "…")

        await tools["reset_ledger"].ainvoke({})
        note = as_text(
            await tools["log_assumption"].ainvoke(
                {
                    "name": "population of Warsaw",
                    "value": 1.86e6,
                    "unit": "people",
                    "low": 1.7e6,
                    "high": 2.0e6,
                    "source": "Wikipedia: Warsaw",
                    "rationale": "city proper, 2023 figure",
                }
            )
        )
        print("4.", note)
        ledger = json.loads(as_text(await tools["read_ledger"].ainvoke({})))
        assert len(ledger) == 1 and ledger[0]["name"] == "population of Warsaw", ledger
        print("5. ledger persists across separate MCP calls OK")

    wiki = wikipedia.invoke({"query": "Warsaw"})
    assert "Best match" in wiki, wiki
    print("6. wikipedia OK:", " ".join(wiki.split())[:110], "…")

    search = web_search.invoke({"query": "how often should a piano be tuned"})
    if search.startswith(("SEARCH ERROR", "SEARCH:")):
        print("7. web_search WARNING (no results or rate-limited right now):", search[:110])
    else:
        print("7. web_search OK:", " ".join(search.split())[:110], "…")

    cases = {3.45e13: "34.5 trillion", 1.87e6: "1.87 million", 46000: "46,000",
             672768000: "673 million", 124: "124", 0.053: "0.053"}
    for raw, expected in cases.items():
        got = human_number(raw)
        assert got == expected, f"human_number({raw}) = {got!r}, expected {expected!r}"
    print("8. human_number formatting OK:", ", ".join(f"{k:g} → {v}" for k, v in cases.items()))

    print("\nALL SMOKE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
