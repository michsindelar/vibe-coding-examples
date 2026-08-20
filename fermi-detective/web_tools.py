"""Framework-native LangChain tools: Wikipedia and DuckDuckGo.

Both are keyless — no accounts, no API keys. Failures come back as plain
strings prefixed with '... ERROR:' so the agent can read them and adapt
instead of crashing the graph.

Wikipedia is fetched with stdlib urllib on purpose: Wikimedia's WAF
fingerprints and 403-blocks popular Python HTTP clients (httpx included),
while urllib with a descriptive User-Agent passes.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request

from ddgs import DDGS
from langchain_core.tools import tool

_HEADERS = {"User-Agent": "FermiDetective/1.0 (educational ReAct agent)"}
_WIKI_API = "https://en.wikipedia.org/w/api.php"
_WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
_TAGS = re.compile(r"<[^>]+>")


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


@tool
def wikipedia(query: str) -> str:
    """Look up an encyclopedic fact on Wikipedia: populations, sizes, dates,
    physical constants, official figures. Give ONE focused topic per call
    ('Warsaw', 'Boeing 747', 'Eiffel Tower'), not a whole question.
    Returns the best-matching article's summary plus alternative titles."""
    try:
        params = urllib.parse.urlencode(
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 5,
                "format": "json",
            }
        )
        data = _get_json(f"{_WIKI_API}?{params}")
        hits = data.get("query", {}).get("search", [])
        if not hits:
            return f"WIKIPEDIA: no article found for {query!r} — try different keywords."
        title = hits[0]["title"]
        quoted = urllib.parse.quote(title.replace(" ", "_"), safe="")
        try:
            extract = _get_json(_WIKI_SUMMARY.format(title=quoted)).get("extract", "")
        except Exception:
            extract = ""
        if not extract:
            extract = _TAGS.sub("", hits[0].get("snippet", ""))
        lines = [f"Best match: {title}", f"Summary: {extract}"]
        others = ", ".join(h["title"] for h in hits[1:])
        if others:
            lines.append(f"Other matching articles: {others}")
        return "\n".join(lines)
    except Exception as exc:  # network hiccups → let the agent decide what to do next
        return f"WIKIPEDIA ERROR: {exc!r}. Retry once or fall back to web_search."


@tool
def web_search(query: str) -> str:
    """Search the web (DuckDuckGo, keyless) for statistics, rates and prices
    that Wikipedia will not have — e.g. 'how often is a piano tuned per year'.
    Use simple keyword queries. Returns titles, URLs and text snippets."""
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            results = DDGS().text(query, max_results=6)
            if not results:
                return f"SEARCH: no results for {query!r} — rephrase with simpler keywords."
            lines = []
            for r in results:
                url = r.get("href") or r.get("url") or ""
                lines.append(f"- {r.get('title', '')} ({url})\n  {r.get('body', '')}")
            return "\n".join(lines)
        except Exception as exc:
            last_exc = exc
            time.sleep(2 * (attempt + 1))
    return (
        f"SEARCH ERROR: {last_exc!r}. Do not retry the same query — use wikipedia "
        f"instead, or make an explicit own estimate with wide bounds."
    )
