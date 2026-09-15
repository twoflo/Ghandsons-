import { describe, it, expect } from "vitest";
import { normaliseDatabaseUrl } from "@/lib/db-url";

describe("normaliseDatabaseUrl", () => {
  it("strips Neon's channel_binding, which postgres-js forwards and the server rejects", () => {
    const out = normaliseDatabaseUrl(
      "postgresql://u:p@ep-cool-1.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(out).not.toContain("channel_binding");
    expect(out).toContain("sslmode=require");
  });

  it("keeps sslmode, which the driver does understand", () => {
    const out = normaliseDatabaseUrl("postgresql://u:p@host/db?sslmode=require");
    expect(out).toContain("sslmode=require");
  });

  it("leaves a plain local connection string alone", () => {
    const raw = "postgresql://postgres:postgres@127.0.0.1:5432/ghandsons";
    expect(normaliseDatabaseUrl(raw)).toBe(raw);
  });

  it("handles a Supabase pooler string with a dotted username", () => {
    const raw =
      "postgresql://postgres.abcdefgh:pw@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
    expect(normaliseDatabaseUrl(raw)).toBe(raw);
  });

  it("does not mangle a password containing reserved characters", () => {
    const raw = "postgresql://user:p%40ss%3Aword@host:5432/db";
    expect(normaliseDatabaseUrl(raw)).toContain("p%40ss%3Aword");
  });

  it("hands back anything it cannot parse rather than throwing", () => {
    expect(normaliseDatabaseUrl("not a url")).toBe("not a url");
  });
});
