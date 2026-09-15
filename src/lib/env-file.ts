/**
 * Loads .env / .env.local for tooling (drizzle-kit, tsx scripts).
 * Next.js loads these itself at runtime, so this is only for CLI entrypoints.
 */
export function config() {
  for (const file of [".env", ".env.local"]) {
    try {
      // Node >= 20.12
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(file);
    } catch {
      /* file absent — fine */
    }
  }
}
