"""Wires everything together:

    two MCP servers (stdio) → LangChain tools → explicit LangGraph ReAct graph.

The only tool surface is MCP — no framework-specific @tool definitions. Both
servers get the same FINANCE_AGENT_OUTPUT_DIR so the yfinance server's CSVs
land where the sandbox's scripts run.
"""

import sys
from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from mcp.client.stdio import get_default_environment

from prompt import build_system_prompt

SERVERS_DIR = Path(__file__).resolve().parents[1] / "servers"


async def create_agent(workspace: Path):
    # Servers get a clean default environment (PATH, HOME, …) plus the shared
    # workspace path — notably NOT the ANTHROPIC_API_KEY this process holds.
    server_env = {**get_default_environment(), "FINANCE_AGENT_OUTPUT_DIR": str(workspace)}

    def stdio_server(script: str) -> dict:
        return {
            "transport": "stdio",
            "command": sys.executable,
            "args": [str(SERVERS_DIR / script)],
            "env": server_env,
        }

    mcp_client = MultiServerMCPClient(
        {
            "yfinance": stdio_server("yfinance_server.py"),
            "python-sandbox": stdio_server("sandbox_server.py"),
        }
    )

    # Discovers both servers' tools and adapts them to LangChain tools.
    tools = await mcp_client.get_tools()

    llm = ChatAnthropic(
        model="claude-opus-4-8",
        max_tokens=16_000,
        thinking={"type": "adaptive"},
    ).bind_tools(tools)

    system = SystemMessage(build_system_prompt(workspace))

    async def call_model(state: MessagesState):
        response = await llm.ainvoke([system, *state["messages"]])
        return {"messages": [response]}

    # The classic ReAct loop, spelled out as a LangGraph state machine:
    # agent → (tool_calls? → tools → agent) | END
    graph = StateGraph(MessagesState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")

    # In-memory checkpointer: state is saved per thread_id, so follow-up
    # questions in the same REPL session keep their context.
    return graph.compile(checkpointer=InMemorySaver())
