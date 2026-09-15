import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "../lib/env-file";

loadEnv();

const { default: postgres } = await import("postgres");

const dir = join(process.cwd(), "src/db/sql");
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    process.stdout.write(`  applying ${file} ... `);
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    console.log("ok");
  }
} finally {
  await sql.end();
}
