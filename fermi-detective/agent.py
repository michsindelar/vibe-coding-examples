"""Fermi Detective — the ReAct loop, hand-rolled as a LangGraph StateGraph.

Two nodes and one conditional edge implement ReAct:

    START → agent ──(tool_calls?)──▶ tools ──▶ agent → … → END

`agent` is the LLM (OpenAI via langchain-openai) with tools bound to it: it
thinks, then either requests a tool (Action) or produces the final answer.
`tools` executes the requested tool and appends its result (Observation).
The loop continues until the model stops calling tools.
"""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode


def as_text(content) -> str:
    """Normalize message/tool content to plain text.

    LLM and MCP results may be a plain string or a list of content blocks —
    MCP tool results arrive as [{'type': 'text', 'text': ...}].
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(block.get("text", ""))
            elif hasattr(block, "text"):
                parts.append(block.text)
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content)

SYSTEM_PROMPT = """\
You are Fermi Detective, a ReAct agent that answers Fermi estimation questions
with grounded, auditable estimates instead of gut feelings.

## Method — follow strictly
1. Briefly restate the question, decompose it into factors (a Fermi
   decomposition) and state the formula you plan to compute — WITH UNITS,
   checking it is dimensionally consistent. If the target quantity itself is
   likely well-documented (an official or famous total, e.g. "all gold ever
   mined", "paint used on the Eiffel Tower"), FIRST try to look it up
   directly and use decomposition as the cross-check.
2. Ground every factor you can in a real source:
   - wikipedia → encyclopedic facts (populations, sizes, official figures),
   - web_search → statistics, rates, prices.
   Prefer a sourced number over a guess. If both tools fail for a factor,
   choose a sensible value yourself, give it WIDE bounds and use the source
   "own estimate".
3. Log EVERY number that enters the calculation with log_assumption
   (value, unit, plausible low/high bounds, source, one-line rationale)
   BEFORE you use it. No unlogged number may appear in the final answer.
4. Do NO mental arithmetic. Every multiplication, division or power goes
   through calculator — including the bounds: compute the low estimate by
   combining bounds in the direction that MINIMIZES the result and the high
   estimate likewise (careful: for a divisor, its HIGH bound minimizes the
   result).
5. Before every tool call, write exactly one short line starting with
   "Thought:" explaining why this call is needed.
6. Sanity-check the final order of magnitude against common sense; if it
   fails, revisit the weakest assumption.

## Final answer format (exactly)
FINAL ESTIMATE: <scientific notation, e.g. 1.2e5> <unit> (≈ <human form, e.g. "120,000" or "34.5 trillion">)
RANGE: <low in scientific notation> - <high in scientific notation> <unit> (≈ <human form low – high>)
MOST SENSITIVE ASSUMPTION: <name> — <one line on why it dominates>

Then 2-3 plain-language sentences summarizing how you got there — write
numbers there in the human form ("about 34.5 trillion"), never bare
scientific notation.

## Rules
- One focused factor per search; simple keyword queries.
- If a tool returns an error text, read it, fix your input and retry once.
- Unit discipline: convert all quantities into ONE unit system with separate
  calculator calls BEFORE combining them — never mix cm³ with liters or feet
  with meters inside a single expression.
- Check each factor's direction: does it multiply or divide? (A packing
  fraction multiplies a container volume; a per-worker capacity divides.)
- Keep Thought lines short.
"""


NUDGE_TEXT = (
    "You stopped without either calling a tool or giving the final answer. "
    "Continue now: make the next tool call, or — if you already have every "
    "factor logged — output the final answer in the required format starting "
    "with 'FINAL ESTIMATE:'."
)

_MAX_NUDGES = 2


class AgentState(TypedDict):
    """Conversation state: the growing ReAct transcript + nudge counter."""

    messages: Annotated[list, add_messages]
    nudges: int


def build_agent(tools: list, model_name: str):
    """Compile the ReAct graph for `model_name` with `tools` bound to it."""
    kwargs: dict = {}
    # Reasoning models (gpt-5*, o*) reject a custom temperature.
    if not model_name.startswith(("gpt-5", "o1", "o3", "o4")):
        kwargs["temperature"] = 0.2
    llm = ChatOpenAI(model=model_name, **kwargs).bind_tools(tools)
    system = SystemMessage(content=SYSTEM_PROMPT)

    async def agent_node(state: AgentState) -> dict:
        reply = await llm.ainvoke([system, *state["messages"]])
        return {"messages": [reply]}

    def nudge_node(state: AgentState) -> dict:
        return {
            "messages": [HumanMessage(content=NUDGE_TEXT)],
            "nudges": state.get("nudges", 0) + 1,
        }

    def route(state: AgentState) -> str:
        last = state["messages"][-1]
        if last.tool_calls:
            return "tools"
        # Terminate only on a well-formed final answer; a model that merely
        # *narrates* its next action without calling a tool gets nudged.
        if "FINAL ESTIMATE" in as_text(last.content) or state.get("nudges", 0) >= _MAX_NUDGES:
            return END
        return "nudge"

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("nudge", nudge_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route, {"tools": "tools", "nudge": "nudge", END: END})
    graph.add_edge("tools", "agent")
    graph.add_edge("nudge", "agent")
    return graph.compile()
