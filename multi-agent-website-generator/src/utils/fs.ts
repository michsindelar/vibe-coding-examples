import { cp, mkdir, rm, writeFile, copyFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf8");
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function removePath(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export async function copyPath(source: string, target: string): Promise<void> {
  await ensureDir(dirname(target));
  await cp(source, target, { force: true, recursive: true });
}

export async function copyAsset(source: string, target: string): Promise<void> {
  await ensureDir(dirname(target));
  await copyFile(source, target);
}

export async function keepOnly(paths: string[], selectedPath: string): Promise<void> {
  await Promise.all(paths.filter((path) => path !== selectedPath).map(removePath));
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sitegen-brand";
}
