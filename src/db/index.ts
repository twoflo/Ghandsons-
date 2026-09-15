import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "@/lib/db-url";

const connectionString = databaseUrl();

/**
 * One pool per process. Next dev reloads modules on every edit, so the client
 * is stashed on globalThis to avoid exhausting Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  __ghandsonsSql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForDb.__ghandsonsSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__ghandsonsSql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type Db = typeof db;
/** Inside a transaction the type differs slightly; use this for helpers. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
