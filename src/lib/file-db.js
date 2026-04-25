import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const directory = path.dirname(filePath);
  const tempFile = `${filePath}.tmp`;

  await ensureDir(directory);
  await fs.writeFile(tempFile, `${content}\n`, "utf8");
  await fs.rename(tempFile, filePath);
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
