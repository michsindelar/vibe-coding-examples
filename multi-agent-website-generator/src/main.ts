#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile, stdin as input } from "node:process";
import { fileURLToPath } from "node:url";
import { runChatSupervisor } from "./agents/chatSupervisor.ts";
import { runSupervisor, type SupervisorOptions } from "./agents/supervisor.ts";
import { closeCli, printSuccess } from "./utils/cli.ts";
import { removePath } from "./utils/fs.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type CliOptions = SupervisorOptions & {
  clean: boolean;
};

function loadProjectEnv(): void {
  const envPath = resolve(PROJECT_ROOT, ".env");
  if (existsSync(envPath)) loadEnvFile(envPath);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { auto: false, clean: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--auto") options.auto = true;
    if (arg === "--clean") options.clean = true;
  }
  return options;
}

async function run(): Promise<void> {
  loadProjectEnv();
  const options = parseArgs(process.argv.slice(2));

  if (options.clean) {
    await removePath("dist");
    printSuccess("Removed dist/.");
    return;
  }

  if (options.auto || !input.isTTY) {
    await runSupervisor(options);
    return;
  }

  await runChatSupervisor();
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeCli);
