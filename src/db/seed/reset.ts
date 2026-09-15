import { config as loadEnv } from "../../lib/env-file";
import { databaseUrl } from "../../lib/db-url";
loadEnv();

const { default: postgres } = await import("postgres");

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

console.log("Dropping and recreating the public schema…");
await sql.unsafe(`
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO public;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
`);
await sql.end();
console.log("Done. Run `npm run db:setup` to rebuild.");
