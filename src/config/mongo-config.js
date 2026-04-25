function getDbNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, "").trim();
    return dbName || null;
  } catch {
    return null;
  }
}

export function getMongoConfig() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  const dbName = String(
    process.env.MONGODB_DB_NAME
    || getDbNameFromUri(uri)
    || "bot_whatsapp"
  ).trim();
  const appName = String(process.env.MONGODB_APP_NAME || "nexus-nex").trim() || "nexus-nex";

  return {
    uri,
    dbName,
    appName
  };
}
