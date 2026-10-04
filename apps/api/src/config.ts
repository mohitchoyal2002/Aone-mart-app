import "dotenv/config";
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  dbPath: process.env.DATABASE_PATH || "./data/aone.sqlite",
  tursoUrl: process.env.TURSO_DATABASE_URL || "",
  tursoToken: process.env.TURSO_AUTH_TOKEN || "",
  serverless: process.env.VERCEL === "1",
  jwtSecret: process.env.JWT_SECRET || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  expoToken: process.env.EXPO_ACCESS_TOKEN || "",
  production: process.env.NODE_ENV === "production",
  trustProxy: Number(process.env.TRUST_PROXY || 0),
};
if (config.serverless && (!config.tursoUrl || !config.tursoToken)) {
  throw new Error("Vercel requires the configured permanent Turso database.");
}
if (config.tursoUrl && !config.tursoToken) {
  throw new Error("TURSO_AUTH_TOKEN is required for the remote database.");
}
if (config.jwtSecret.length < 32 || config.jwtSecret.startsWith("generate_")) {
  throw new Error(
    "JWT_SECRET must contain at least 32 random characters. Run npm run setup first.",
  );
}
