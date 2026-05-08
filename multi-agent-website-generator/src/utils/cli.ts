import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import ora from "ora";

const rl = createInterface({ input, output });

function promptLabel(question: string): string {
  return chalk.cyan.bold(question);
}

function indentMultiline(value: string, prefix: string, indentWidth: number): string {
  return value
    .split("\n")
    .map((line, index) => `${index === 0 ? prefix : " ".repeat(indentWidth)}${line}`)
    .join("\n");
}

function highlightOptionContent(value: string): string {
  const colonIndex = value.indexOf(": ");
  if (colonIndex > 0 && colonIndex <= 40) {
    return `${chalk.bold(value.slice(0, colonIndex))}${chalk.dim(value.slice(colonIndex))}`;
  }

  const dashIndex = value.indexOf(" - ");
  if (dashIndex > 0 && dashIndex <= 60) {
    return `${chalk.bold(value.slice(0, dashIndex))}${chalk.dim(value.slice(dashIndex))}`;
  }

  return chalk.bold(value);
}

function highlightNumberedOptions(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      if (!match) return line;
      const [, spaces, number, marker, rest] = match;
      return `${spaces}${chalk.bgBlue.white.bold(` ${number}${marker} `)} ${highlightOptionContent(rest)}`;
    })
    .join("\n");
}

export async function promptText(question: string, fallback = ""): Promise<string> {
  if (!input.isTTY) return fallback;
  const suffix = fallback ? ` (${fallback})` : "";
  const normalizedQuestion = question.trim();
  const prefix = question.startsWith("\n") ? "\n" : "";
  const label =
    normalizedQuestion === "You"
      ? `${prefix}${chalk.cyan.bold("You")} ${chalk.cyan("|")}`
      : `${promptLabel(question)}${chalk.dim(suffix)}${chalk.cyan(":")}`;
  const answer = await rl.question(`${label} `);
  return answer.trim() || fallback;
}

export async function promptSelect<T>(
  title: string,
  items: T[],
  render: (item: T, index: number) => string,
  auto = false,
): Promise<T> {
  printStepHeading(title);
  items.forEach((item, index) => {
    const number = chalk.bgBlue.white.bold(` ${index + 1}. `);
    console.log(`${number} ${highlightOptionContent(render(item, index))}`);
  });

  if (auto || !input.isTTY) {
    printInfo("Auto-selected option 1.");
    return items[0];
  }

  while (true) {
    const answer = await rl.question(`${promptLabel("Choose an option number")}${chalk.cyan(": ")} `);
    const index = Number.parseInt(answer, 10) - 1;
    if (items[index]) return items[index];
    printWarning(`Enter a number from 1 to ${items.length}.`);
  }
}

export async function promptApproval(message: string, auto = false): Promise<boolean> {
  if (auto || !input.isTTY) return true;
  const answer = await rl.question(`${promptLabel(message)} ${chalk.dim("[Y/n]")}${chalk.cyan(": ")} `);
  return !answer.trim() || /^y(es)?$/i.test(answer.trim());
}

export function printAssistantMessage(message: string): void {
  const content = highlightNumberedOptions(message.trim());
  console.log(`\n${indentMultiline(content, chalk.magenta.bold("Supervisor ") + chalk.magenta("| "), 4)}`);
}

export function printUserMessage(message: string): void {
  console.log(`\n${indentMultiline(message.trim(), chalk.cyan.bold("You ") + chalk.cyan("| "), 6)}`);
}

export function printStepHeading(title: string): void {
  console.log(`\n${chalk.blue.bold("==")} ${chalk.bold(title)}`);
}

export function printInfo(message: string): void {
  console.log(`${chalk.gray("-")} ${message}`);
}

export function printSuccess(message: string): void {
  console.log(`${chalk.green("OK")} ${message}`);
}

export function printWarning(message: string): void {
  console.log(`${chalk.yellow("!")} ${message}`);
}

export function printProgressEvent(label: string, status: "completed" | "failed"): void {
  const marker = status === "completed" ? chalk.green("✓") : chalk.red("✖");
  console.log(`${marker} ${label}`);
}

export type LiveProgressTracker = {
  switchTo(label: string): void;
  succeed(): void;
  fail(): void;
  stop(): void;
  currentLabel(): string | null;
};

export function createLiveProgressTracker(): LiveProgressTracker {
  let spinner: ReturnType<typeof ora> | null = null;
  let activeLabel: string | null = null;

  function switchTo(label: string): void {
    if (activeLabel === label) return;
    if (spinner) {
      spinner.succeed(activeLabel || undefined);
      spinner = null;
    }

    activeLabel = label;
    if (!output.isTTY) {
      printInfo(`${label}...`);
      return;
    }

    spinner = ora({
      text: chalk.dim(label),
      stream: output,
    }).start();
  }

  function succeed(): void {
    if (!activeLabel) return;
    if (spinner) {
      spinner.succeed(activeLabel);
    } else if (!output.isTTY) {
      printProgressEvent(activeLabel, "completed");
    }
    spinner = null;
    activeLabel = null;
  }

  function fail(): void {
    if (!activeLabel) return;
    if (spinner) {
      spinner.fail(activeLabel);
    } else if (!output.isTTY) {
      printProgressEvent(activeLabel, "failed");
    }
    spinner = null;
    activeLabel = null;
  }

  function stop(): void {
    spinner?.stop();
    spinner = null;
    activeLabel = null;
  }

  return {
    switchTo,
    succeed,
    fail,
    stop,
    currentLabel: () => activeLabel,
  };
}

export async function withAiSpinner<T>(message: string, task: () => Promise<T>): Promise<T> {
  if (!output.isTTY) {
    printInfo(`${message}...`);
    return task();
  }

  const spinner = ora({
    text: chalk.dim(message),
    stream: output,
  }).start();

  try {
    const result = await task();
    spinner.succeed(message);
    return result;
  } catch (error) {
    spinner.fail(message);
    throw error;
  }
}

export function closeCli(): void {
  rl.close();
}
