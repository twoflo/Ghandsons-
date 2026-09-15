import type { Config } from "drizzle-kit";
import { config as loadEnv } from "./src/lib/env-file";
import { normaliseDatabaseUrl } from "./src/lib/db-url";

loadEnv();

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: normaliseDatabaseUrl(process.env.DATABASE_URL!) },
  verbose: true,
  strict: false,
} satisfies Config;
