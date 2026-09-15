import bcrypt from "bcryptjs";

/**
 * Kept apart from src/lib/auth.ts (which is `server-only` because it touches
 * cookies and headers) so CLI scripts such as the seeder can hash a password
 * without pulling in the Next.js request context.
 */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
