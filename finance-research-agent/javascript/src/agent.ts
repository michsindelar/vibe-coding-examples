import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { buildSystemPrompt } from "./prompt.js";

/**
 * Wires everything together:
 *   MCP server (code-runner, via stdio) → LangChain tools → ReAct agent.
 *
 * The only tool surface is MCP — no framework-specific `@tool` definitions.
 */
export async function createAgent(outputDir: string) {
  const mcpClient = new MultiServerMCPClient({
    useStandardContentBlocks: true,
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: "",
    mcpServers: {
      "code-runner": {
        transport: "stdio",
        command: "npx",
        args: ["-y", "mcp-server-code-runner@latest"],
        restart: { enabled: true, maxAttempts: 3, delayMs: 1000 },
      },
    },
  });

  // Discovers the MCP server's tools (→ `run-code`) and adapts them to LangChain tools.
  const tools = await mcpClient.getTools();

  const llm = new ChatAnthropic({
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });

  const agent = createReactAgent({
    llm,
    tools,
    // In-memory checkpointer: conversation state is saved per thread_id, so
    // follow-up questions in the same REPL session keep their context.
    checkpointSaver: new MemorySaver(),
    prompt: buildSystemPrompt(outputDir),
  });

  return { agent, mcpClient };
}
