import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const SESSIONS_DIR = path.join(PROJECT_ROOT, "sessions");
export const INSTANCE_FILE_NAME = "instance.json";
export const AUTH_DIR_NAME = "auth";
export const DATABASE_DIR = path.join(PROJECT_ROOT, "database");

export const RECONNECT_DELAY_MS = 5_000;
