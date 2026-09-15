/**
 * Hosted Postgres providers hand out connection strings with query parameters
 * that postgres-js forwards to the server as startup options, where unknown
 * ones are rejected outright. Neon appends `channel_binding=require`, which
 * fails with `unrecognized configuration parameter`. Strip the parameters the
 * driver cannot act on, keep the ones it understands (notably `sslmode`).
 */
const UNSUPPORTED_PARAMS = new Set([
  "channel_binding",
  "options", // Neon's endpoint hack; only needed by drivers without SNI
]);

export function normaliseDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw; // not a URL we can reason about — hand it over untouched
  }

  for (const key of [...url.searchParams.keys()]) {
    if (UNSUPPORTED_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }

  return url.toString();
}

/** Reads DATABASE_URL, normalised, with a message a non-developer can act on. */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and paste your " +
        "Postgres connection string into it.",
    );
  }
  return normaliseDatabaseUrl(raw);
}
