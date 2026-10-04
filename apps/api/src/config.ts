import "dotenv/config";
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  dbPath: process.env.DATABASE_PATH || "./data/aone.sqlite",
  jwtSecret: process.env.JWT_SECRET || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  expoToken: process.env.EXPO_ACCESS_TOKEN || "",
  production: process.env.NODE_ENV === "production",
  trustProxy: Number(process.env.TRUST_PROXY || 0),
};
if (config.jwtSecret.length < 32 || config.jwtSecret.startsWith("generate_")) {
  throw new Error(
    "JWT_SECRET must contain at least 32 random characters. Run npm run setup first.",
  );
}
