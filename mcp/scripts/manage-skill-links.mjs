#!/usr/bin/env node

import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillName = "excalidash-diagrams";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const skillSource = resolve(packageRoot, "skills", skillName);
const skillLinks = [
  resolve(homedir(), ".agents", "skills", skillName),
  resolve(homedir(), ".claude", "skills", skillName),
];

async function statOrNull(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertSkillSource() {
  const sourceStat = await statOrNull(skillSource);
  const manifestStat = await statOrNull(resolve(skillSource, "SKILL.md"));

  if (!sourceStat?.isDirectory() || !manifestStat?.isFile()) {
    throw new Error(`Packaged skill is missing or invalid: ${skillSource}`);
  }
}

async function installLink(skillLink) {
  await mkdir(dirname(skillLink), { recursive: true });

  const linkStat = await statOrNull(skillLink);
  if (linkStat && !linkStat.isSymbolicLink()) {
    throw new Error(`Refusing to replace non-symlink path: ${skillLink}`);
  }

  if (linkStat) {
    const currentTarget = resolve(dirname(skillLink), await readlink(skillLink));
    if (currentTarget === skillSource) {
      console.log(`Skill link is current: ${skillLink}`);
      return;
    }

    await unlink(skillLink);
  }

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(skillSource, skillLink, linkType);
  console.log(`Linked ${skillLink} -> ${skillSource}`);
}

async function removeLink(skillLink) {
  const linkStat = await statOrNull(skillLink);
  if (!linkStat) {
    console.log(`Skill link is already absent: ${skillLink}`);
    return;
  }

  if (!linkStat.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-symlink path: ${skillLink}`);
  }

  const currentTarget = resolve(dirname(skillLink), await readlink(skillLink));
  if (currentTarget !== skillSource) {
    throw new Error(`Refusing to remove link owned by another installation: ${skillLink}`);
  }

  await unlink(skillLink);
  console.log(`Removed skill link: ${skillLink}`);
}

async function main() {
  const action = process.argv[2] ?? "install";
  if (action !== "install" && action !== "remove") {
    throw new Error("Usage: manage-skill-links.mjs [install|remove]");
  }

  if (action === "install") await assertSkillSource();

  let failed = false;
  for (const skillLink of skillLinks) {
    try {
      if (action === "install") await installLink(skillLink);
      else await removeLink(skillLink);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
}

await main();
