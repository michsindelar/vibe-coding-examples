"""Order-of-magnitude benchmark for Fermi Detective.

Runs every question in eval_questions.json through the agent and marks it
PASS when the estimate lands within one order of magnitude (a factor of 10)
of the reference value — the usual bar for a Fermi estimate.

Run:  uv run eval.py            (uses the OpenAI key from .env)
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import sys

from dotenv import load_dotenv

from formatting import human_number
from main import answer_question, mcp_client

_FINAL = re.compile(r"FINAL ESTIMATE[:*\s~≈]*\$?([0-9][0-9_.,]*(?:[eE][+-]?[0-9]+)?)")


def extract_estimate(text: str) -> float | None:
    m = _FINAL.search(text)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "").replace("_", ""))
    except ValueError:
        return None


async def run() -> None:
    load_dotenv()
    if not os.getenv("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY is not set — copy .env.example to .env and fill it in.")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eval_questions.json")
    with open(path, encoding="utf-8") as f:
        cases = json.load(f)

    rows = []
    client = mcp_client()
    async with client.session("fermi") as session:
        for i, case in enumerate(cases, 1):
            print(f"\n{'=' * 64}\n[{i}/{len(cases)}] {case['question']}")
            final, ledger = await answer_question(case["question"], model, session)
            est = extract_estimate(final)
            ok = (
                est is not None
                and est > 0
                and abs(math.log10(est / case["reference"])) <= 1.0
            )
            rows.append((case, est, ok, len(ledger)))

    print(f"\n\n{'=' * 64}\nRESULTS — PASS = within one order of magnitude of the reference")
    for case, est, ok, n_assumptions in rows:
        shown = human_number(est) if est is not None else "n/a"
        print(
            f" {'PASS' if ok else 'FAIL'}  est {shown:>14}  ref {human_number(case['reference']):>12} "
            f"{case['unit']:<8} assumptions {n_assumptions}  | {case['question']}"
        )
    passed = sum(1 for _, _, ok, _ in rows if ok)
    print(f"\n{passed}/{len(rows)} within one order of magnitude")


if __name__ == "__main__":
    asyncio.run(run())
