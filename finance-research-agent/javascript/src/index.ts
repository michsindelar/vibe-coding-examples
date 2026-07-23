import "dotenv/config";
import { mkdir, readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BaseMessage } from "@langchain/core/messages";
import { createAgent } from "./agent.js";
import { renderAgentUpdate, renderToolUpdate } from "./render.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(projectRoot, "output");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "Copy .env.example to .env and add your key, or export it in your shell.",
  );
  process.exit(1);
}

await mkdir(OUTPUT_DIR, { recursive: true });

console.log("Starting agent (first run may pause while npx downloads the MCP server)…");
const { agent, mcpClient } = await createAgent(OUTPUT_DIR);
const threadId = randomUUID();

let shuttingDown = false;
async function shutdown(code = 0): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true;
    try {
      await mcpClient.close();
    } catch {
      // best effort — we're exiting anyway
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));

console.log(`
📈 Finance research agent — LangGraph.js + MCP code-runner
   Try:
   • What was NVDA's best month in 2025?
   • Compare AAPL and MSFT over the last year: total return, volatility, and draw a comparison chart
   • What is annualized volatility?
   Type "exit" to quit. Charts are saved to ./output/
`);

/** List files in output/ modified after `sinceMs`. */
async function newFilesSince(sinceMs: number): Promise<string[]> {
  const entries = await readdir(OUTPUT_DIR);
  const fresh: string[] = [];
  for (const entry of entries) {
    if (entry === ".gitkeep") continue;
    const info = await stat(path.join(OUTPUT_DIR, entry));
    if (info.mtimeMs >= sinceMs) fresh.push(path.join("output", entry));
  }
  return fresh;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

// Iterate lines instead of rl.question(): the async iterator buffers input that
// arrives while a turn is running (e.g. piped queries), rather than dropping it.
process.stdout.write("you> ");
for await (const rawLine of rl) {
  const line = rawLine.trim();
  if (!line) {
    process.stdout.write("you> ");
    continue;
  }
  if (["exit", "quit"].includes(line.toLowerCase())) break;

  const turnStart = Date.now();
  try {
    const stream = await agent.stream(
      { messages: [{ role: "user", content: line }] },
      { configurable: { thread_id: threadId }, recursionLimit: 50, streamMode: "updates" },
    );

    for await (const chunk of stream as AsyncIterable<
      Record<string, { messages?: BaseMessage[] }>
    >) {
      if (chunk.agent?.messages) renderAgentUpdate(chunk.agent.messages);
      if (chunk.tools?.messages) renderToolUpdate(chunk.tools.messages);
    }

    const files = await newFilesSince(turnStart);
    if (files.length > 0) console.log(`Files written: ${files.join(", ")}\n`);
  } catch (error) {
    // A failed turn must not kill the REPL.
    console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.stdout.write("you> ");
}

rl.close();
await shutdown(0);
