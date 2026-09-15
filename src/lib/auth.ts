import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import type { Role, Permission } from "./permissions";
import { can } from "./permissions";

const COOKIE_NAME = "ghandsons_session";
const SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS ?? 30);
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone: string | null;
  mustChangePassword: boolean;
};

export { hashPassword, verifyPassword };

/* -------------------------------- sessions -------------------------------- */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const hdrs = await headers();

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: hdrs.get("user-agent")?.slice(0, 500) ?? null,
    ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE_NAME);
}

/** Cached per request by React; safe to call from many components. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      phone: users.phone,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      sessionId: sessions.id,
      tokenHash: sessions.tokenHash,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;
  if (!safeEqual(row.tokenHash, hashToken(token))) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role as Role,
    phone: row.phone,
    mustChangePassword: row.mustChangePassword,
  };
}

/** Throws if not signed in. Use in every server action and protected page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("You have been signed out. Please sign in again.");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthError(
      "You don't have access to that. Ask the owner if you think you should.",
    );
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/* --------------------------------- login ---------------------------------- */

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string };

export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  const normalised = email.trim().toLowerCase();

  const found = await db
    .select()
    .from(users)
    .where(and(raw`lower(${users.email}) = ${normalised}`, isNull(users.deletedAt)))
    .limit(1);

  const user = found[0];

  // Always run a hash comparison so a missing account and a wrong password
  // take the same amount of time.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const passwordOk = await verifyPassword(password, hash);

  if (!user || !passwordOk) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await db
        .update(users)
        .set({
          failedLoginCount: failed,
          lockedUntil:
            failed >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : user.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }
    return { ok: false, message: "That email and password don't match. Have another go." };
  }

  if (!user.isActive) {
    return { ok: false, message: "This account has been switched off. Ask the owner to turn it back on." };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return {
      ok: false,
      message: `Too many tries. Wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
    };
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await createSession(user.id);

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as Role,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
    },
  };
}
