import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log("Existing .env retained. Run npm run bootstrap-admin if needed.");
  process.exit(0);
}
const password = `Am!${randomBytes(12).toString("base64url")}9`;
let template = readFileSync(".env.example", "utf8")
  .replace(
    "generate_a_random_64_character_secret_with_npm_run_setup",
    randomBytes(48).toString("hex"),
  )
  .replace("replace_with_a_unique_password", password);
writeFileSync(".env", template, { mode: 0o600 });
console.log("Backend config created. Initial admin phone: 9999999999");
console.log("Initial admin password:", password);
console.log(
  "Set ADMIN_PHONE and ADMIN_PASSWORD in apps/api/.env, then run npm run bootstrap-admin -w @aone/api.",
);
